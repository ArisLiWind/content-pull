export class LastValueChannel {
  constructor(name) {
    this.name = name;
  }

  merge(_currentValue, nextValue) {
    return nextValue;
  }
}

export class BinaryOperatorChannel {
  constructor(name, reducer) {
    this.name = name;
    this.reducer = reducer;
  }

  merge(currentValue, nextValue) {
    return this.reducer(currentValue, nextValue);
  }
}

export class ChannelSet {
  constructor(channels = {}) {
    this.channels = channels;
  }

  apply(state, patch, applyStatePatch) {
    const reducedPatch = Object.entries(patch || {}).reduce((nextPatch, [key, value]) => {
      const channel = this.channels[key];
      return {
        ...nextPatch,
        [key]: channel ? channel.merge(state[key], value) : value
      };
    }, {});

    return applyStatePatch(state, reducedPatch);
  }
}

export function createContentChannels() {
  return new ChannelSet({
    logs: new BinaryOperatorChannel("logs", (current = [], next = []) => [...current, ...next].slice(-80)),
    sources: new BinaryOperatorChannel("sources", mergeById),
    facts: new BinaryOperatorChannel("facts", mergeById),
    currentNode: new LastValueChannel("currentNode"),
    status: new LastValueChannel("status"),
    draft: new LastValueChannel("draft"),
    publishStatus: new LastValueChannel("publishStatus")
  });
}

function mergeById(current = [], next = []) {
  return [...new Map([...current, ...next].map((item) => [item.id, item])).values()];
}
