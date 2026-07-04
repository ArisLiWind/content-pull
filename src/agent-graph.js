export class StateGraph {
  constructor({ name, stateSchema = "ContentTaskState" }) {
    this.name = name;
    this.stateSchema = stateSchema;
    this.nodes = new Map();
    this.edges = new Map();
    this.entryPoint = null;
    this.finishPoints = new Set();
  }

  addNode(name, action, options = {}) {
    this.nodes.set(name, { name, action, retryPolicy: options.retryPolicy || { maxAttempts: 2 } });
    return this;
  }

  addEdge(from, to) {
    const exits = this.edges.get(from) || [];
    this.edges.set(from, [...exits, to]);
    return this;
  }

  setEntryPoint(name) {
    this.entryPoint = name;
    return this;
  }

  setFinishPoint(name) {
    this.finishPoints.add(name);
    return this;
  }

  compile() {
    return {
      name: this.name,
      stateSchema: this.stateSchema,
      entryPoint: this.entryPoint,
      finishPoints: [...this.finishPoints],
      nodes: Object.fromEntries(this.nodes),
      edges: Object.fromEntries(this.edges)
    };
  }
}

export function createContentAgentGraph(nodes) {
  return new StateGraph({ name: "Content Agent Graph" })
    .addNode("collectAttentionSignals", nodes.collectAttentionSignals)
    .addNode("researchSources", nodes.researchSources)
    .addNode("extractFacts", nodes.extractFacts)
    .addNode("analyzeTrend", nodes.analyzeTrend)
    .addNode("scoreAttention", nodes.scoreAttention)
    .addNode("generateOutline", nodes.generateOutline)
    .addNode("generateDraft", nodes.generateDraft)
    .addNode("reviewDraft", nodes.reviewDraft)
    .addNode("reviseDraft", nodes.reviseDraft)
    .addNode("preparePublishing", nodes.preparePublishing)
    .addNode("saveHistory", nodes.saveHistory)
    .addEdge("collectAttentionSignals", "researchSources")
    .addEdge("researchSources", "extractFacts")
    .addEdge("extractFacts", "analyzeTrend")
    .addEdge("analyzeTrend", "scoreAttention")
    .addEdge("scoreAttention", "generateOutline")
    .addEdge("generateOutline", "generateDraft")
    .addEdge("generateDraft", "reviewDraft")
    .addEdge("reviewDraft", "preparePublishing")
    .setEntryPoint("collectAttentionSignals")
    .setFinishPoint("saveHistory")
    .compile();
}
