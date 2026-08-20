const path = require("path");

const COMMON_SUGGESTIONS = Object.freeze({
  nao: ["não"], tambem: ["também"], voce: ["você"], so: ["só"], ja: ["já"], ate: ["até"], apos: ["após"],
  numero: ["número"], opcao: ["opção"], sugestoes: ["sugestões"], sujestoes: ["sugestões"], correcao: ["correção"],
  configuracao: ["configuração"], alteracao: ["alteração"], movimentacao: ["movimentação"], selecao: ["seleção"],
  conteudo: ["conteúdo"], informacao: ["informação"], documento: ["documento"], procedimento: ["procedimento"],
});

function normalizeWord(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function weightedDistance(sourceValue, candidateValue) {
  const source = normalizeWord(sourceValue);
  const candidate = normalizeWord(candidateValue);
  const previous = Array.from({ length: candidate.length + 1 }, (_, index) => index);
  const current = new Array(candidate.length + 1);
  const closePairs = new Set(["sz", "zs", "jg", "gj", "xc", "cx"]);
  for (let row = 1; row <= source.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= candidate.length; column += 1) {
      const repeatedSource = row > 1 && source[row - 1] === source[row - 2];
      const repeatedCandidate = column > 1 && candidate[column - 1] === candidate[column - 2];
      const pair = `${source[row - 1]}${candidate[column - 1]}`;
      const substitution = source[row - 1] === candidate[column - 1] ? 0 : (closePairs.has(pair) ? 0.25 : 1);
      current[column] = Math.min(
        previous[column] + (repeatedSource ? 0.25 : 1),
        current[column - 1] + (repeatedCandidate ? 0.25 : 1),
        previous[column - 1] + substitution,
      );
    }
    for (let column = 0; column <= candidate.length; column += 1) previous[column] = current[column];
  }
  return previous[candidate.length];
}

function rankSuggestions(word, suggestions) {
  const source = String(word || "").trim();
  const common = COMMON_SUGGESTIONS[normalizeWord(source)] || [];
  const unique = [...new Set([...common, ...suggestions].map((value) => String(value || "").trim()).filter(Boolean))]
    .filter((value) => value.toLocaleLowerCase("pt-BR") !== source.toLocaleLowerCase("pt-BR"));
  return unique.map((value, index) => {
    const commonIndex = common.findIndex((item) => item.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"));
    const hasAccent = value !== value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const accentBonus = hasAccent && normalizeWord(value) === normalizeWord(source) ? 0.1 : 0;
    return { value, score: commonIndex >= 0 ? -100 + commonIndex : weightedDistance(source, value) - accentBonus, index };
  }).sort((left, right) => left.score - right.score || left.index - right.index).slice(0, 8).map((item) => item.value);
}

function createPortugueseSpellChecker(projectRoot) {
  let checkerPromise = null;
  function load() {
    if (!checkerPromise) {
      checkerPromise = import("cspell-lib").then((cspell) => ({
        cspell,
        settings: {
          language: "pt-BR",
          dictionaries: ["pt-br"],
          dictionaryDefinitions: [{
            name: "pt-br",
            path: path.join(projectRoot, "node_modules", "@cspell", "dict-pt-br", "pt_BR.trie.gz"),
          }],
          loadDefaultConfiguration: false,
        },
      }));
    }
    return checkerPromise;
  }

  async function suggestions(word) {
    const source = String(word || "").trim().toLocaleLowerCase("pt-BR");
    const common = (COMMON_SUGGESTIONS[normalizeWord(word)] || [])
      .filter((value) => value.toLocaleLowerCase("pt-BR") !== source);
    try {
      const { cspell, settings } = await load();
      const checked = await cspell.spellCheckDocument(
        { uri: "spellcheck.txt", text: String(word || ""), languageId: "plaintext", locale: "pt-BR" },
        { generateSuggestions: false, noConfigSearch: true },
        settings,
      );
      if (!checked.issues.length) return common;
      const result = await cspell.suggestionsForWord(String(word || ""), {
        locale: "pt-BR", languageId: "plaintext", includeDefaultConfig: false,
        dictionaries: ["pt-br"], numSuggestions: 40, numChanges: 4, strict: false,
      }, settings);
      return rankSuggestions(word, result.suggestions.map((item) => item.wordAdjustedToMatchCase || item.word));
    } catch (_error) {
      return common;
    }
  }

  return { preload: () => suggestions("palavvra"), suggestions };
}

module.exports = { createPortugueseSpellChecker, rankSuggestions };
