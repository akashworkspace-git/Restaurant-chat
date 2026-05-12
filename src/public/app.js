const sessionId = window.localStorage.getItem("restaurant-chat-session") || crypto.randomUUID();
window.localStorage.setItem("restaurant-chat-session", sessionId);

const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#messageInput");
const resetButton = document.querySelector("#resetButton");
const cartLinesEl = document.querySelector("#cartLines");
const stageLabelEl = document.querySelector("#stageLabel");
const subtotalEl = document.querySelector("#subtotal");
const taxEl = document.querySelector("#tax");
const totalEl = document.querySelector("#total");
const menuListEl = document.querySelector("#menuList");
const orderJsonPanelEl = document.querySelector("#orderJsonPanel");
const orderJsonEl = document.querySelector("#orderJson");

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

async function init() {
  const [menuResponse, sessionResponse] = await Promise.all([
    fetch("/api/menu"),
    fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`)
  ]);
  const menu = await menuResponse.json();
  const session = await sessionResponse.json();

  renderMenu(menu);
  if (session.history.length === 0) {
    addMessage("assistant", `Hi, this is ${menu.restaurant.name}. I can take your pickup order.`);
  } else {
    renderHistory(session.history);
  }
  renderSession(session);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = inputEl.value.trim();
  if (!message) return;

  inputEl.value = "";
  addMessage("user", message);
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message })
    });

    if (!response.ok) {
      throw new Error("Chat request failed");
    }

    const data = await response.json();
    addMessage("assistant", data.reply);
    renderSession(data.session);
  } catch {
    addMessage("assistant", "Something went wrong locally. Try again in a moment.");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
});

resetButton.addEventListener("click", async () => {
  const response = await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  const session = await response.json();
  messagesEl.innerHTML = "";
  addMessage("assistant", "Fresh cart started.");
  renderSession(session);
  inputEl.focus();
});

function renderHistory(history) {
  messagesEl.innerHTML = "";
  history.forEach((message) => addMessage(message.role, message.content));
}

function addMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  row.append(bubble);
  messagesEl.append(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderSession(session) {
  stageLabelEl.textContent = titleCase(session.stage);
  subtotalEl.textContent = money.format(session.totals.subtotal);
  taxEl.textContent = money.format(session.totals.tax);
  totalEl.textContent = money.format(session.totals.total);

  cartLinesEl.innerHTML = "";
  if (session.cart.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No items yet";
    cartLinesEl.append(empty);
  } else {
    session.cart.forEach((line) => {
      const row = document.createElement("div");
      row.className = "cart-line";

      const item = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = `${line.qty} x ${line.name}`;
      item.append(name);

      if (line.modifiers.length > 0) {
        const modifiers = document.createElement("span");
        modifiers.textContent = line.modifiers.join(", ");
        item.append(modifiers);
      }

      const total = document.createElement("b");
      total.textContent = money.format(line.line_total);

      row.append(item, total);
      cartLinesEl.append(row);
    });
  }

  if (session.final_order) {
    orderJsonPanelEl.classList.remove("hidden");
    orderJsonEl.textContent = JSON.stringify(session.final_order, null, 2);
  } else {
    orderJsonPanelEl.classList.add("hidden");
    orderJsonEl.textContent = "";
  }
}

function renderMenu(menu) {
  menuListEl.innerHTML = "";
  menu.categories.forEach((category) => {
    const group = document.createElement("div");
    group.className = "menu-group";

    const title = document.createElement("h2");
    title.textContent = category.name;
    group.append(title);

    category.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "menu-item";

      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.name;
      const description = document.createElement("span");
      description.textContent = item.description;
      copy.append(name, description);

      const price = document.createElement("b");
      price.textContent = money.format(item.price);

      row.append(copy, price);
      group.append(row);
    });

    menuListEl.append(group);
  });
}

function setBusy(isBusy) {
  formEl.classList.toggle("busy", isBusy);
  inputEl.disabled = isBusy;
  formEl.querySelector("button").disabled = isBusy;
}

function titleCase(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

init();
