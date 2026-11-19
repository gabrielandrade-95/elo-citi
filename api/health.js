export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    ia: Boolean(process.env.GEMINI_API_KEY),
    modelo: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  });
}
