import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { createAudioStreamFromText } from "./elevenLabsHelper.js";
import fetch from "node-fetch"; 
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const elevenLabsApiKey = process.env.OPENAI_TTS_API_KEY;
const azureSpeechKey = process.env.AZURE_SPEECH_KEY;
const azureSpeechRegion = process.env.AZURE_SPEECH_REGION;

if (!azureSpeechKey || !azureSpeechRegion) {
  throw new Error("AZURE_SPEECH_KEY or AZURE_SERVICE_REGION is not defined");
}

const app = express();
app.use(express.json());
app.use(cors());
const port = 4000;


app.get("/", (req, res) => {
  res.send("Hello World!");
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { shell: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (messageIndex, textInput) => {
  const time = new Date().getTime();
  console.log(`Starting lip sync for message ${messageIndex}`);
  try {
    const audioDir = path.resolve("audios");
    try {
      await fs.access(audioDir);
    } catch (error) {
      await fs.mkdir(audioDir);
    }

    const audioBuffer = await createAudioStreamFromText(textInput);
    const fileNameMP3 = `audios/message_${messageIndex}.mp3`;
    await fs.writeFile(fileNameMP3, audioBuffer);
    console.log(`Generated MP3 file at ${fileNameMP3}`);

    const fileNameWAV = `audios/message_${messageIndex}.wav`;
    await execCommand(`ffmpeg -y -i ${fileNameMP3} ${fileNameWAV}`);
    console.log(`Converted MP3 to WAV file at ${fileNameWAV}`);

    const rhubarbCommand = `rhubarb -r phonetic -f json -o ${audioDir}/message_${messageIndex}.json ${fileNameWAV} --extendedShapes "ABCDEFGHX"`;
    await execCommand(rhubarbCommand);
    console.log(`Lip sync done for message ${messageIndex} in ${new Date().getTime() - time}ms`);

    return await readJsonTranscript(`audios/message_${messageIndex}.json`);
  } catch (error) {
    console.error(`Error during lip sync for message ${messageIndex}:`, error);
    throw error;
  }
};

const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading JSON transcript:", error);
    throw error;
  }
};

const speechToText = async (audioBuffer) => {
  const pushStream = sdk.AudioInputStream.createPushStream();
  pushStream.write(audioBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const speechConfig = sdk.SpeechConfig.fromSubscription(azureSpeechKey, azureSpeechRegion);

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text);
        } else {
          reject(new Error(`Recognition failed: ${result.reason}`));
        }
      },
      (error) => {
        reject(new Error(`Error recognizing speech: ${error}`));
      }
    );
  });
};

// Fonction pour obtenir la prédiction du prix
const get_predicted_price = async (ticker) => {
  const url = "http://127.0.0.1:5000/predict"; 
  const payload = { ticker };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Failed to fetch prediction");
    const data = await response.json();
    console.log(data); 
    return data.predicted_prices;
  } catch (error) {
    console.error("Error in fetching stock prediction:", error);
    return null;
  }
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    const message = "Don't forget to leave a message sir, I'm here to help you.";
  

  // Utiliser un index unique
  const timestamp = Date.now();

  // Générer l'audio pour la réponse par défaut
  const audioBuffer = await createAudioStreamFromText(message);
  const fileNameMP3 = `audios/message_${timestamp}.mp3`;
  await fs.writeFile(fileNameMP3, audioBuffer); // Sauvegarder le fichier MP3

  // MP3 vers WAV
  const fileNameWAV = `audios/message_${timestamp}.wav`;
  await execCommand(`ffmpeg -y -i ${fileNameMP3} ${fileNameWAV}`);

  // Rhubarb pour le lipsync
  const rhubarbCommand = `rhubarb -r phonetic -f json -o audios/message_${timestamp}.json ${fileNameWAV} --extendedShapes "ABCDEFGHX"`;
  await execCommand(rhubarbCommand);

  // lecture les données de lipsync
  const lipSyncData = await readJsonTranscript(`audios/message_${timestamp}.json`);
    const base64Audio = audioBuffer.toString("base64");
    res.send({
      messages: [
        {
          text: message,
          facialExpression: "smile",
          animation: "Talking",
          audio: base64Audio, // Inclure l'audio généré
          lipsync: lipSyncData, // Ajouter les données de lipsync


        },
      ],
    });
    return;
  }
 // On vérifie si la commande de prédiction est demandée
 if (userMessage.startsWith("predict")) {
  const parts = userMessage.split(" ");
  if (parts.length < 2) {
    res.send({
      messages: [
        {
          text: "Usage: predict <ticker>",
          facialExpression: "neutral",
          animation: "Talking",
        },
      ],
    });
    return;
  }

  const ticker = parts[1].toUpperCase();  

  try {
    const predictedPrice = await get_predicted_price(ticker);
    const predictionMessage = `The stock price for ${ticker} after 2 months will be : $${predictedPrice.toFixed(2)}`
    const audioBuffer = await createAudioStreamFromText(predictionMessage);
    const fileNameMP3 = `audios/prediction_${ticker}.mp3`;
    await fs.writeFile(fileNameMP3, audioBuffer); 
    // Convert MP3 to WAV
    const fileNameWAV = `audios/prediction_${ticker}.wav`;
    await execCommand(`ffmpeg -y -i ${fileNameMP3} ${fileNameWAV}`);
    // Execute Rhubarb for lip sync
    const rhubarbCommand = `rhubarb -r phonetic -f json -o audios/prediction_${ticker}.json ${fileNameWAV} --extendedShapes "ABCDEFGHX"`;
    await execCommand(rhubarbCommand);
    const lipSyncData = await readJsonTranscript(`audios/prediction_${ticker}.json`); //hadi hiya lli ghaddir lipsync

    const base64Audio = audioBuffer.toString("base64");
    res.send({
      messages: [
        {
          text: predictionMessage,
          facialExpression: "smile",
          animation: "Talking",
          audio: base64Audio, 
          lipsync: lipSyncData, 


        },
      ],
    });
    return;
  } catch (error) {
    console.error("Erreur lors de la récupération de la prédiction :", error);
    res.send({
      messages: [
        {
          text: "Erreur lors de la récupération de la prédiction.",
          facialExpression: "neutral",
          animation: "Talking",
        },
      ],
    });
    return;
  }
}
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      max_tokens: 1000,
      temperature: 1,
      messages: [
        {
          role: "system",
          content: `
          your name is ruby
          You will always reply with a JSON array of messages. With 2 message.
          Each message has a text, facialExpression, and animation property.
          The facial expressions is default.
          The animation is: Talking. 
          `,
        },
        {
          role: "user",
          content: userMessage || "Hello",
        },
      ],
    });

    let messages = JSON.parse(completion.choices[0].message.content);
    if (messages.messages) {
      messages = messages.messages;
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      const audioBuffer = await createAudioStreamFromText(message.text);
      message.audio = audioBuffer.toString("base64");

      message.lipsync = await lipSyncMessage(i, message.text, audioBuffer);
    }

    res.send({ messages });
  } catch (error) {
    console.error("Error in /chat endpoint:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Virtual Avatar running on port ${port}`);
});
