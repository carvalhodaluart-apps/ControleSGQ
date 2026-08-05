function clearUntouchedBlankQualityInfo(procedure) {
  if (procedure.title !== "Novo procedimento" || procedure.sections?.length) return;
  const info = procedure.qualityInfo || {};
  const templateStarts = [
    ["objective", "Orientar a montagem"], ["application", "Aplic"],
    ["responsibilities", "Operador executa"], ["relatedDocs", "Procedimento de controle"],
    ["records", "Registro de montagem"], ["acceptanceCriteria", "Montagem conclu"],
    ["deviationTreatment", "Desvios devem"], ["traceability", "Manter v"],
    ["retention", "Reter os registros"], ["climateConsideration", "N"],
  ];
  if (!templateStarts.every(([key, prefix]) => String(info[key] || "").startsWith(prefix))) return;
  templateStarts.forEach(([key]) => { info[key] = ""; });
}
