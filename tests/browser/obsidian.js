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
class Setting {
  constructor() {}
  setName() { return this; }
  setDesc() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
  addText() { return this; }
}
class Notice {
}
class Menu {
  items = [];
  addItem(configure) {
    const item = {
      title: "",
      disabled: false,
      action: () => {},
      setTitle(value) { this.title = value; return this; },
      setIcon() { return this; },
      setWarning() { return this; },
      setDisabled(value) { this.disabled = value; return this; },
      onClick(action) { this.action = action; return this; },
    };
    configure(item);
    this.items.push(item);
    return this;
  }
  addSeparator() { return this; }
  showAtPosition(position) {
    document.querySelector("#mock-node-menu")?.remove();
    const menu = document.createElement("div");
    menu.id = "mock-node-menu";
    menu.style.cssText = `position:fixed;left:${position.x}px;top:${position.y}px;z-index:100;background:#fff;border:1px solid #aaa;padding:8px;display:grid;gap:6px`;
    for (const item of this.items) {
      const button = document.createElement("button");
      button.textContent = item.title;
      button.disabled = item.disabled;
      button.onclick = item.action;
      menu.append(button);
    }
    document.body.append(menu);
  }
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
  Setting,
  Component,
  FuzzySuggestModal,
  ItemView,
  MarkdownRenderer,
  Modal,
  Menu,
  Notice,
  WorkspaceLeaf,
  normalizePath,
  requestUrl
};
