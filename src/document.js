export class DocumentWorkspace {
  constructor(filesystem) {
    this.filesystem = filesystem;
  }

  saveDraftSet(task, draft) {
    const files = [];
    if (draft.markdown) {
      files.push(
        this.filesystem.write(task.taskId, "article.md", draft.markdown, {
          kind: "article",
          version: draft.currentVersion
        })
      );
    }

    for (const variant of draft.variants || []) {
      const path = variant.platform === "xiaohongshu" ? "video-script.md" : `${variant.platform}.md`;
      files.push(
        this.filesystem.write(task.taskId, path, variant.markdown, {
          kind: variant.platform === "xiaohongshu" ? "video_script" : "article",
          platform: variant.platform,
          title: variant.title
        })
      );
    }

    return files;
  }

  listDocuments(taskId) {
    return this.filesystem.list(taskId);
  }
}
