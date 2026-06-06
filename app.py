from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import joblib

app = Flask(__name__)
CORS(app)

model = joblib.load("model.pkl")
vectorizer = joblib.load("vectorizer.pkl")

disease_df = pd.read_csv("disease_master.csv")
precautions_df = pd.read_csv("precautions.csv")

disease_df["symptoms"] = disease_df["symptoms"].apply(
    lambda x: [s.strip().lower() for s in x.split(";")]
)

symptom_synonyms = {
    "high fever": ["high fever", "fever", "temperature", "hot body", "bukhar", "tez bukhar"],
    "low fever": ["low fever", "mild fever", "slight fever", "halka bukhar"],

    "pain behind eyes": ["pain behind eyes", "pain behind my eyes", "eye pain", "aankhon ke piche dard", "aankh dard"],
    "body aches": ["body aches", "body pain", "body hurts", "pain in body", "muscle pain", "badan dard", "sharir dard"],
    "chills": ["chills", "shivering", "feeling cold", "kapkapi", "thand lagna"],
    "sweating": ["sweating", "sweat", "sweating a lot", "pasina", "zyada pasina"],

    "vomiting": ["vomiting", "vomited", "throwing up", "puking", "ulti", "ulti ho rahi hai"],
    "nausea": ["nausea", "feeling like vomiting", "ulti jaisa lagna", "jee machalna"],
    "headache": ["headache", "head pain", "sar dard", "sir dard"],
    "rash": ["rash", "skin rash", "daane", "skin par daane"],
    "bleeding gums": ["bleeding gums", "gum bleeding", "masudo se khoon"],

    "shortness of breath": ["shortness of breath", "breathing problem", "saans phoolna"],
    "difficulty breathing": ["difficulty breathing", "hard to breathe", "breathing difficulty", "saans lene mein dikkat"],
    "chest tightness": ["chest tightness", "chest feels tight", "tight chest", "seene me jakdan"],
    "wheezing": ["wheezing", "whistling sound while breathing", "saans me seeti ki awaaz"],

    "runny nose": ["runny nose", "nose is running", "running nose", "naak behna", "jukam", "zukaam"],
    "sneezing": ["sneezing", "sneeze", "keep sneezing", "chheenk", "chheenk aana"],
    "sore throat": ["sore throat", "throat pain", "pain in throat", "gale me dard"],
    "cough": ["cough", "coughing", "khansi"],
    "nasal congestion": ["blocked nose", "stuffy nose", "nasal congestion", "naak band"],

    "diarrhea": ["diarrhea", "loose motion", "loose motions", "dast", "patla stool"],
    "watery diarrhea": ["watery diarrhea", "watery stool", "paani jaisa dast"],
    "stomach pain": ["stomach pain", "abdominal pain", "pain in stomach", "pet dard"],
    "abdominal pain": ["abdominal pain", "stomach pain", "pet me dard"],
    "bloating": ["bloating", "gas", "pet me gas"],
    "constipation": ["constipation", "unable to pass stool", "kabz"],

    "burning urination": [
        "burning urination", "burning while urinating", "pain while urinating",
        "burns when i urinate", "burning when i pee", "pain when i pee",
        "peshab me jalan", "urine me jalan"
    ],
    "frequent urination": [
        "frequent urination", "urinating frequently", "peeing a lot",
        "bathroom very frequently", "urinate very frequently",
        "going to the bathroom very frequently", "bar bar peshab"
    ],
    "cloudy urine": ["cloudy urine", "dhundla urine"],
    "blood in urine": ["blood in urine", "red urine", "peshab me khoon"],

    "excessive thirst": ["very thirsty", "excessive thirst", "thirsty all the time", "feel thirsty all the time", "zyada pyaas"],
    "increased hunger": ["increased hunger", "hungry all the time", "excessive hunger", "zyada bhook"],
    "slow healing wounds": ["slow healing wounds", "cuts not healing", "wounds not healing", "zakhm dheere bharna"],
    "weight loss": ["weight loss", "losing weight", "wajan kam hona"],

    "heartburn": ["heartburn", "chest burning", "seene me jalan"],
    "acid reflux": ["acid reflux", "acid coming up", "khatti dakar"],
    "chest discomfort": ["chest discomfort", "chest uneasiness", "seene me discomfort"],
    "blurred vision": ["blurred vision", "blurry vision", "dhundla dikhna"],
    "dizziness": ["dizziness", "feeling dizzy", "chakkar aana"],

    "fatigue": ["fatigue", "tiredness", "very tired", "thakan", "kamzori"],
    "weakness": ["weakness", "weak", "kamzori"],
    "loss of appetite": ["loss of appetite", "not feeling hungry", "bhook nahi lagna"],
    "swollen neck glands": ["swollen neck glands", "neck swelling", "gardan me sujan"],
    "sensitivity to light": ["sensitivity to light", "light hurts eyes", "roshni se dikkat"],
    "sensitivity to sound": ["sensitivity to sound", "sound hurts", "awaaz se dikkat"]
}

def extract_symptoms(user_text):
    user_text = user_text.lower()
    extracted = []

    for standard_symptom, phrases in symptom_synonyms.items():
        for phrase in phrases:
            if phrase in user_text:
                extracted.append(standard_symptom)
                break

    return list(set(extracted))


def get_precautions(disease):
    row = precautions_df[precautions_df["disease"] == disease]

    if row.empty:
        return []

    row = row.iloc[0]

    return [
        row["precaution_1"],
        row["precaution_2"],
        row["precaution_3"],
        row["precaution_4"],
        row["precaution_5"]
    ]


@app.route("/")
def home():
    return "AI Healthcare Assistant Running"


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    user_text = data.get("symptoms", "")

    extracted_symptoms = extract_symptoms(user_text)
    symptom_text = " ".join(extracted_symptoms)

    # ML model probabilities
    X = vectorizer.transform([symptom_text])
    ml_probs = model.predict_proba(X)[0]
    classes = model.classes_

    ml_scores = {
        classes[i]: float(ml_probs[i] * 100)
        for i in range(len(classes))
    }

    final_results = []

    for _, row in disease_df.iterrows():
        disease = row["disease"]
        disease_symptoms = row["symptoms"]

        matched_symptoms = [
            symptom for symptom in extracted_symptoms
            if symptom in disease_symptoms
        ]

        if len(disease_symptoms) == 0:
            rule_score = 0
        else:
            rule_score = (len(matched_symptoms) / len(disease_symptoms)) * 100

        ml_score = ml_scores.get(disease, 0)

        final_score = (0.75 * rule_score) + (0.25 * ml_score)

        final_results.append({
            "disease": disease,
            "confidence": round(final_score, 2),
            "ml_score": round(ml_score, 2),
            "rule_score": round(rule_score, 2),
            "matched_symptoms": matched_symptoms,
            "severity": row["severity"],
            "precautions": get_precautions(disease)
        })

    final_results = [r for r in final_results if r["confidence"] > 0]
    final_results.sort(key=lambda x: x["confidence"], reverse=True)

    return jsonify({
        "extracted_symptoms": extracted_symptoms,
        "predictions": final_results[:3]
    })



if __name__ == "__main__":
    app.run(debug=True)