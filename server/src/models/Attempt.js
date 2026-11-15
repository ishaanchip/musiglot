import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  pronunciationScore: Number, // 0-10
  pitchScore: Number, // 0-10
  // azure | openai | local | estimate ("estimate" = voicing only, not real pronunciation)
  pronunciationMethod: String,
  transposition: Number, // semitones (0-12) the user sang away from the original key
  perLine: [
    {
      _id: false,
      index: Number,
      pronunciation: Number, // 0-10 or null if the line was not sung / not scorable
      pitch: Number, // 0-10 or null
      timingOffsetMs: Number, // + = user late, - = early
      heard: String, // what the recognizer heard, when available
      words: [{ _id: false, text: String, score: Number, errorType: String }],
    },
  ],
  feedback: { wentWell: [String], improve: [String] },
  recordingPath: String,
});

export default mongoose.model('Attempt', attemptSchema);
