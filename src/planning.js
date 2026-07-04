export class ContentPlanner {
  createPlan(task) {
    return {
      id: `plan-${task.taskId}`,
      objective: task.topic.normalized,
      createdAt: new Date().toISOString(),
      stages: [
        stage("attention", "Collect audience and platform signals", ["attention.collect"]),
        stage("research", "Search sources and extract facts", ["research.search"]),
        stage("synthesis", "Analyze trend, score attention, and choose an angle", []),
        stage("document", "Create article and video-script documents", ["document.write"]),
        stage("review", "Run quality review and request human approval", ["human.approval"]),
        stage("publish", "Prepare publisher-ready drafts", ["publisher.prepare"])
      ]
    };
  }
}

function stage(id, goal, tools) {
  return {
    id,
    goal,
    tools,
    status: "pending"
  };
}
