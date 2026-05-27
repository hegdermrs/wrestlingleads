"""Train and persist the tabular LightGBM classifier."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from .config import DEFAULT_TRAINING_FILE, FEW_SHOT_PATH, METRICS_PATH, MODEL_PATH
from .features import NamedFeatureFrame, build_tabular_features, create_preprocessing_pipeline
from .parser import build_training_label, load_leads_file


def _select_few_shot_examples(df: pd.DataFrame, n: int = 5) -> list[dict]:
    customers = df[df["Lifecycle Stage"].astype(str).str.strip() == "Customer"]
    if customers.empty:
        customers = df[df["Lifecycle Stage"].astype(str).str.strip() == "Subscriber"]
    sample = customers.head(n)
    examples: list[dict] = []
    for _, row in sample.iterrows():
        examples.append(
            {
                "name": f"{row.get('First Name', '')} {row.get('Last Name', '')}".strip(),
                "job_title": str(row.get("Job Title", "")),
                "job_function": str(row.get("Job function", "")),
                "message": str(row.get("Message", ""))[:500],
                "lifecycle": str(row.get("Lifecycle Stage", "")),
                "score": 90,
                "reasons": ["Converted to customer", "Strong fit for 1-on-1 mental coaching"],
            }
        )
    return examples


def train_model(
    training_path: Path | str | None = None,
    model_path: Path | None = None,
    metrics_path: Path | None = None,
) -> dict:
    """Train LightGBM on historical leads and save artifacts."""
    training_path = Path(training_path or DEFAULT_TRAINING_FILE)
    model_path = model_path or MODEL_PATH
    metrics_path = metrics_path or METRICS_PATH

    model_path.parent.mkdir(parents=True, exist_ok=True)

    df = load_leads_file(str(training_path), filename=training_path.name)
    if df.empty:
        raise ValueError("Training file is empty.")

    y = build_training_label(df)
    X = build_tabular_features(df)

    if y.nunique() < 2:
        raise ValueError("Need both positive and negative examples to train.")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    preprocessor = create_preprocessing_pipeline(list(X.columns))
    classifier = lgb.LGBMClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=6,
        num_leaves=31,
        class_weight="balanced",
        random_state=42,
        verbose=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("named_features", NamedFeatureFrame()),
            ("classifier", classifier),
        ]
    )

    pipeline.fit(X_train, y_train)

    y_prob = pipeline.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    hot_mask = y_prob >= 0.75
    hot_precision = precision_score(y_test[hot_mask], y_pred[hot_mask], zero_division=0) if hot_mask.any() else 0.0
    hot_recall = recall_score(y_test, hot_mask.astype(int), zero_division=0)

    metrics = {
        "rows": len(df),
        "positive_rate": float(y.mean()),
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_prob)),
        "hot_tier_precision": float(hot_precision),
        "hot_tier_recall": float(hot_recall),
        "feature_columns": list(X.columns),
    }

    joblib.dump(pipeline, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    few_shot = _select_few_shot_examples(df)
    FEW_SHOT_PATH.write_text(json.dumps(few_shot, indent=2), encoding="utf-8")

    return metrics


def load_model(model_path: Path | None = None) -> Pipeline:
    model_path = model_path or MODEL_PATH
    if not model_path.exists():
        train_model()
    return joblib.load(model_path)


def predict_ml_scores(df: pd.DataFrame, model: Pipeline | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Return probability scores (0-1) and scaled scores (0-100)."""
    model = model or load_model()
    X = build_tabular_features(df)
    if hasattr(model, "feature_names_in_"):
        X = X[list(model.feature_names_in_)]
    prob = model.predict_proba(X)[:, 1]
    return prob, prob * 100.0
