
# Chemins vers les modèles des différentes actions
#MODEL_PATHS = {
  #  'apple': 'C:\\Users\\Israe\\Downloads\\content\\apple',
 #   'meta': 'C:\\Users\\Israe\\Downloads\\content\\meta',
 #   'amazon': 'C:\\Users\\Israe\\Downloads\\content\\amazon',
#    'microsoft': 'C:\\Users\\Israe\\Downloads\\content\\microsoft'}
from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
from datetime import datetime
import tensorflow as tf
from sklearn.preprocessing import MinMaxScaler
import yfinance as yf

app = Flask(__name__)

# Charger le modèle
model = tf.saved_model.load('C:\\Users\\Israe\\Downloads\\content\\apple')  

# Fonction pour prédire les prix sur 90 jours
def predict_price_60_days(data):
    # Normaliser les données
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)

    # Créer les séquences
    seq_length = 60
    last_sequence = scaled_data[-seq_length:] 

    # Préparer l'entrée pour le modèle
    X = np.reshape(last_sequence, (1, last_sequence.shape[0], 1)).astype(np.float32)

    # Utiliser l'interface de prédiction du modèle
    infer = model.signatures["serving_default"]
    predicted_price = infer(tf.convert_to_tensor(X))['output_0']

    # Convertir en float et inverse la normalisation
    predicted_price = scaler.inverse_transform(predicted_price.numpy())
    
    return float(predicted_price[0][0])  


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        ticker = data.get('ticker')

        if not ticker:
            return jsonify({'error': 'Ticker is required.'}), 400
        
        df = yf.download(ticker, start='2012-01-01', end=datetime.now())

        if df.empty:
            return jsonify({'error': 'No data found for the specified ticker.'}), 404

        close_data = df['Close'].values.reshape(-1, 1)
        
        # Faire la prédiction pour 90 jours
        predicted_price = predict_price_60_days(close_data)
        
        return jsonify({'predicted_prices': predicted_price})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    app.run(debug=True, port=5000)
