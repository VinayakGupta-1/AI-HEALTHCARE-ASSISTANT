import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier

# Load dataset
df = pd.read_csv("disease_master.csv")

# Convert symptom format: semicolon separated → space separated text
df["symptom_text"] = df["symptoms"].apply(
    lambda x: x.replace(";", " ").lower()
)

X = df["symptom_text"]
y = df["disease"]

# Convert text symptoms into numerical features
vectorizer = TfidfVectorizer()

X_vectorized = vectorizer.fit_transform(X)

# Train model
model = RandomForestClassifier(
    n_estimators=100,
    random_state=42
)

model.fit(X_vectorized, y)

# Save model and vectorizer
joblib.dump(model, "model.pkl")
joblib.dump(vectorizer, "vectorizer.pkl")

print("Model trained successfully!")
print("model.pkl and vectorizer.pkl created.")