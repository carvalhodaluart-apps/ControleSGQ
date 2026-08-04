function publicErrorMessage(error) {
  const status = error.status || 500;
  if (status >= 500 && process.env.NODE_ENV === "production") return "Erro interno.";
  return error.message || "Erro interno.";
}

function sendError(res, error) {
  res.status(error.status || 500).json({ error: publicErrorMessage(error) });
}

module.exports = { publicErrorMessage, sendError };
