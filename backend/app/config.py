from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

DEFAULT_TRAINING_FILE = DATA_DIR / "leads.xlsx"
MODEL_PATH = MODELS_DIR / "lead_classifier.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"
FEW_SHOT_PATH = MODELS_DIR / "few_shot_examples.json"

POSITIVE_LIFECYCLE_STAGES = {"Customer", "Subscriber"}

ML_WEIGHT = 0.40
LLM_WEIGHT = 0.40
HUBSPOT_10PT_WEIGHT = 0.10
RULES_WEIGHT = 0.10

TIER_THRESHOLDS = {
    "Hot": 75,
    "Warm": 50,
    "Cold": 25,
}

CATEGORICAL_COLUMNS = [
    "Job Title",
    "Job function",
    "Investment Level",
    "Relationship Status",
    "Source",
    "Sport",
    "Wrestler's Grade",
    "Years experience",
    "Customer Type",
    "State/Region",
]

TEXT_COLUMNS = [
    "Message",
    "Job function",
    "Wrestler's Goal",
    "Membership Notes",
]

DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-v4-flash"
DEEPSEEK_MAX_CONCURRENCY = 20
DEEPSEEK_MAX_RETRIES = 5
DEEPSEEK_RETRY_BASE_DELAY = 1.0
