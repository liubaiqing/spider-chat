class Component {
  cleanups = [];
  load() {
  }
  unload() {
    this.cleanups.splice(0).forEach((fn) => fn());
  }
  register(fn) {
    this.cleanups.push(fn);
  }
}
class ItemView extends Component {
  contentEl = document.createElement("div");
  leaf;
  constructor(leaf) {
    super();
    this.leaf = leaf;
    Object.assign(this.contentEl, {
      empty() {
        this.replaceChildren();
      },
      addClass(name) {
        this.classList.add(name);
      },
      onWindowMigrated(listener) {
        const event = () => listener();
        this.addEventListener("test-window-migrated", event);
        return () => this.removeEventListener("test-window-migrated", event);
      }
    });
  }
}
class WorkspaceLeaf {
}
class FuzzySuggestModal {
}
class Modal {
}
class ButtonComponent {
}
class Notice {
}
class App {
}
const normalizePath = (path) => path;
const requestUrl = async () => {
  throw new Error("Network disabled in UI test");
};
const MarkdownRenderer = {
  async render(_app, markdown, root) {
    const delay = markdown.startsWith("slow") ? 90 : 5;
    await new Promise((resolve) => setTimeout(resolve, delay));
    for (const line of markdown.split("\n\n")) {
      const p = root.ownerDocument.createElement("p");
      p.textContent = line;
      root.append(p);
    }
  }
};
export {
  App,
  ButtonComponent,
  Component,
  FuzzySuggestModal,
  ItemView,
  MarkdownRenderer,
  Modal,
  Notice,
  WorkspaceLeaf,
  normalizePath,
  requestUrl
};
