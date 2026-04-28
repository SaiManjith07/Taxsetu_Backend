import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { TextToSpeechClient } from '@google-cloud/text-to-speech'

if (!admin.apps.length) admin.initializeApp()

const voiceConfig = {
  hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-D' },
  ta: { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-A' },
  te: { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
}

let ttsClient
function getTtsClient() {
  if (!ttsClient) ttsClient = new TextToSpeechClient()
  return ttsClient
}

/**
 * Generate voice message with Google Cloud Text-to-Speech.
 * Request: { text: string, language?: 'hi'|'ta'|'te'|'en', gender?: 'female'|'male', speed?: number }
 * Response: { audio_url: string, duration: number }
 */
export const generateVoice = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { text, language = 'hi', gender = 'female', speed = 0.95 } = request.data || {}
    if (!text || typeof text !== 'string') throw new HttpsError('invalid-argument', 'text required')

    try {
      const voice = voiceConfig[language] || voiceConfig.hi
      const client = getTtsClient()

      const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode: voice.languageCode,
          name: voice.name,
          ssmlGender: gender === 'female' ? 'FEMALE' : 'MALE',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: speed,
          pitch: 0,
          volumeGainDb: 0,
        },
      })

      const bucket = admin.storage().bucket()
      const fileName = `voice/${request.auth.uid}/${Date.now()}.mp3`
      const file = bucket.file(fileName)

      await file.save(response.audioContent, {
        metadata: { contentType: 'audio/mpeg' },
      })

      await file.makePublic()
      const audioUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
      const duration = Math.ceil(text.length / 15)

      return { audio_url: audioUrl, duration }
    } catch (error) {
      console.error('Narrator generateVoice error:', error)
      throw new HttpsError('internal', error.message || 'Voice generation failed')
    }
  }
)
