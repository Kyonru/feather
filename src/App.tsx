import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import WebSocket from "@tauri-apps/plugin-websocket";
import "./App.css";

function App() {
  const [greetMsg] = useState("");
  const [_, setName] = useState("");

  useEffect(() => {
    // when using `"withGlobalTauri": true`, you may use
    // const WebSocket = window.__TAURI__.websocket;

    const enableFetch = async () => {
      try {
        fetch("http://localhost:4004/config?p=feather")
          .then((res) => res.json())
          .then((data) => console.log("Got from Love2D:", data));
        // post
        // fetch("http://localhost:4004/config", {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json",
        //   },
        //   body: JSON.stringify({
        //     input: "Hello World",
        //   }),
        // })
        //   .then((res) => res.json())
        //   .then((data) => console.log("Got from Love2D:", data));
      } catch (e) {
        console.log(e);
      }
    };

    const interval = setInterval(enableFetch, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
