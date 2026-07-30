let documentTypes = [
  { key: "it", label: "Instru\u00e7\u00e3o de trabalho", prefix: "IT", active: true },
  { key: "pop", label: "Procedimento operacional padr\u00e3o", prefix: "POP", active: true },
  { key: "mbp", label: "Manual de boas pr\u00e1ticas", prefix: "MBP", active: true },
  { key: "for", label: "Formul\u00e1rio", prefix: "FOR", active: true },
  { key: "rdt", label: "Registro de desvio tempor\u00e1rio", prefix: "RDT", active: true },
  { key: "pr", label: "Procedimento", prefix: "PR", active: true },
  { key: "rg", label: "Registro", prefix: "RG", active: true },
  { key: "ma", label: "Manual", prefix: "MA", active: true },
  { key: "pl", label: "Plano", prefix: "PL", active: true },
];
let sectors = [
  { key: "producao", label: "Produ\u00e7\u00e3o", prefix: "PR", active: true },
  { key: "qualidade", label: "Qualidade", prefix: "QL", active: true },
  { key: "engenharia", label: "Engenharia", prefix: "EN", active: true },
  { key: "manutencao", label: "Manuten\u00e7\u00e3o", prefix: "MN", active: true },
  { key: "administrativo", label: "Administrativo", prefix: "AD", active: true },
  { key: "projeto-desenvolvimento", label: "Projeto e Desenvolvimento", prefix: "PD", active: true },
  { key: "almoxarifado", label: "Almoxarifado", prefix: "AL", active: true },
  { key: "geral", label: "Geral", prefix: "GE", active: true },
];
let qualityFieldConfiguration = [
  { key: "objective", label: "Objetivo", active: true },
  { key: "application", label: "Aplica\u00e7\u00e3o", active: true },
  { key: "responsibilities", label: "Responsabilidades", active: true },
  { key: "relatedDocs", label: "Materiais, sistemas ou documentos relacionados", active: true },
  { key: "records", label: "Registros gerados", active: true },
  { key: "acceptanceCriteria", label: "Crit\u00e9rios de aceita\u00e7\u00e3o", active: true },
  { key: "deviationTreatment", label: "Tratamento de desvios", active: true },
  { key: "traceability", label: "Rastreabilidade", active: true },
  { key: "retention", label: "Reten\u00e7\u00e3o de registros", active: true },
  { key: "climateConsideration", label: "Mudan\u00e7as clim\u00e1ticas", active: true },
];

function isConfiguredFieldActive(field) {
  return field?.active !== false && field?.active !== 0 && String(field?.active).toLowerCase() !== "false";
}

function applyProcedureConfiguration(configuration) {
  if (Array.isArray(configuration?.documentTypes) && configuration.documentTypes.length) documentTypes = configuration.documentTypes;
  if (Array.isArray(configuration?.sectors) && configuration.sectors.length) sectors = configuration.sectors;
  if (Array.isArray(configuration?.qualityFields) && configuration.qualityFields.length) {
    qualityFieldConfiguration = configuration.qualityFields.map((field) => ({
      ...field,
      active: isConfiguredFieldActive(field),
    }));
  }
  if (typeof activeProcedure !== "undefined" && activeProcedure) normalizeProcedure(activeProcedure);
}

async function loadProcedureConfiguration() {
  const data = await apiRequest("/api/configuration");
  applyProcedureConfiguration(data.configuration);
}
