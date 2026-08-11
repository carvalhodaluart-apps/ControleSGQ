function publicErrorMessage(error) {
  const status = error.status || 500;
  if (error.type === "entity.too.large") return "O conteúdo enviado para gerar o PDF excede o limite permitido. Reduza as imagens ou divida o procedimento.";
  if (status >= 500 && (process.env.NODE_ENV === "production" || process.env.RENDER)) return "Erro interno.";
  return error.message || "Erro interno.";
}

function sendError(res, error) {
  res.status(error.status || 500).json({ error: publicErrorMessage(error) });
}

module.exports = { publicErrorMessage, sendError };
