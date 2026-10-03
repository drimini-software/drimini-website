const form = document.querySelector("[data-contact-form]");

if (form instanceof HTMLFormElement) {
  const button = form.querySelector("[data-submit-button]");
  const status = form.querySelector("[data-form-status]");

  form.addEventListener("submit", async (event) => {
    if (!form.reportValidity()) return;

    event.preventDefault();
    if (button instanceof HTMLButtonElement) button.disabled = true;
    if (status instanceof HTMLElement) {
      status.hidden = false;
      status.dataset.state = "pending";
      status.textContent = "Sending…";
    }

    try {
      const body = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") body.append(name, value);
      }

      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });
      const result = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : { ok: false, message: "The message could not be received right now." };

      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || "The message could not be received right now.");
      }

      form.reset();
      if (typeof window.turnstile?.reset === "function") window.turnstile.reset();
      if (status instanceof HTMLElement) {
        status.dataset.state = "success";
        status.textContent = result.message;
      }
    } catch (error) {
      if (status instanceof HTMLElement) {
        status.dataset.state = "error";
        status.textContent =
          error instanceof Error
            ? error.message
            : "The message could not be received right now. Please try again later.";
      }
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  });
}
