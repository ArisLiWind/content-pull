export class AgentLoopRunner {
  constructor({ graph, channels, checkpointer, applyStatePatch, appendLog, delayMs = 320 }) {
    this.graph = graph;
    this.channels = channels;
    this.checkpointer = checkpointer;
    this.applyStatePatch = applyStatePatch;
    this.appendLog = appendLog;
    this.delayMs = delayMs;
  }

  async runNode(state, nodeName, message, context, emit) {
    const nodeSpec = this.graph.nodes[nodeName];
    if (!nodeSpec) throw new Error(`Unknown node: ${nodeName}`);

    let nextState = this.channels.apply(state, { currentNode: nodeName }, this.applyStatePatch);
    nextState = this.appendLog(nextState, message, { node: nodeName });
    this.checkpointer.save(nextState.taskId, nextState, { phase: "before_node", node: nodeName });
    emit(nextState);
    await delay(this.delayMs);

    const maxAttempts = nodeSpec.retryPolicy?.maxAttempts || 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const patch = await nodeSpec.action(nextState, context);
        nextState = this.channels.apply(nextState, patch, this.applyStatePatch);
        this.checkpointer.save(nextState.taskId, nextState, { phase: "after_node", node: nodeName, attempt });
        emit(nextState);
        return nextState;
      } catch (error) {
        nextState = this.channels.apply(nextState, { retryCount: nextState.retryCount + 1 }, this.applyStatePatch);
        nextState = this.appendLog(nextState, `${error.message}${attempt < maxAttempts ? "，准备重试" : ""}`, {
          level: "error",
          node: nodeName
        });
        this.checkpointer.save(nextState.taskId, nextState, { phase: "node_error", node: nodeName, attempt });
        emit(nextState);
        if (attempt >= maxAttempts) throw error;
      }
    }

    return nextState;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
