import { setStatus } from "./state.js";

import("./app.js").catch(err =>
  setStatus(`Could not load the app (${err.message}). Serve this folder over http and check your internet connection.`, "bad"));
