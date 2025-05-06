// media/managerScript.js
(function () {
  if (typeof acquireVsCodeApi === "undefined") {
    console.error("acquireVsCodeApi is not available.");
    return;
  }
  const vscode = acquireVsCodeApi();

  // --- Get DOM elements and check for existence ---
  const currentModelSpan = document.getElementById("currentModelName");
  const availableModelsUl = document.getElementById("availableModelsList");
  const openChatBtn = document.getElementById("openChatBtn");
  const loadBtn = document.getElementById("loadBtn");
  const addBtn = document.getElementById("addBtn");
  const importBtn = document.getElementById("importBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  if (
    !currentModelSpan ||
    !availableModelsUl ||
    !openChatBtn ||
    !loadBtn ||
    !addBtn ||
    !importBtn ||
    !deleteBtn
  ) {
    console.error("ManagerView: One or more UI elements not found!");
    return;
  }

  // --- Helper Functions ---
  function sendMessage(command, data = {}) {
    vscode.postMessage({ command, ...data });
  }

  // --- Event Listeners ---
  openChatBtn.addEventListener("click", () => sendMessage("openChat"));
  loadBtn.addEventListener("click", () => sendMessage("load"));
  addBtn.addEventListener("click", () => sendMessage("add"));
  importBtn.addEventListener("click", () => sendMessage("import"));
  deleteBtn.addEventListener("click", () => sendMessage("delete"));

  // --- Message Listener (from Extension) ---
  window.addEventListener("message", (event) => {
    const message = event.data;
    console.log("ManagerView received message:", message.command);

    if (message.command === "updateModel") {
      const currentModel = message.model || "No Model Selected";
      currentModelSpan.textContent = currentModel;

      // --- Update the displayed list ---
      if (message.availableModels && availableModelsUl) {
        availableModelsUl.innerHTML = ""; // Clear list
        if (message.availableModels.length === 0) {
          const li = document.createElement("li");
          li.textContent = "(No models available)";
          li.style.fontStyle = "italic";
          availableModelsUl.appendChild(li);
        } else {
          message.availableModels.forEach((model) => {
            const li = document.createElement("li");
            li.textContent = model;
            li.title = model;
            if (model === currentModel) {
              li.classList.add("current");
            }
            availableModelsUl.appendChild(li);
          });
        }
      }
      // --- End list update ---
    }
  });

  // --- Initial Request ---
  sendMessage("getModel");
})();
