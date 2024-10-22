import * as dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";



import { promises as fs } from "fs"; 


dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_TTS_API_KEY, 
});

export const createAudioStreamFromText = async (text) => {
  const audioDir = path.resolve("audios");
  const speechFile = path.join(audioDir, `message_${Date.now()}.mp3`); 

  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(speechFile, buffer); 
    return buffer;
  } catch (error) {
    console.error("Erreur lors de la génération de l'audio :", error.message);
    throw new Error(`Échec de la création de l'audio : ${error.message}`);
  }

};