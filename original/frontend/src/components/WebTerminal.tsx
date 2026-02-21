"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Import xterm CSS
import "@xterm/xterm/css/xterm.css";

interface WebTerminalProps {
  instanceId: string;
  userId: string;
  initialCommand?: string;
  onClose?: () => void;
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export function WebTerminal({ instanceId, userId, initialCommand, onClose }: WebTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [errorMessage, setErrorMessage] = useState("");

  const connect = useCallback(async () => {
    if (!terminalRef.current) return;

    setConnectionState("connecting");
    setErrorMessage("");

    // Dynamic imports for xterm (browser-only)
    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");

    // Clean up previous instance
    if (termInstanceRef.current) {
      termInstanceRef.current.dispose();
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    termInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(terminalRef.current);
    fitAddon.fit();

    terminal.writeln("Connecting to instance...\r\n");

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Use same-origin websocket endpoint proxied by Nginx
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${instanceId}?token=${encodeURIComponent(userId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = "arraybuffer";

    const normalizeClientSize = () => {
      const cols = Math.max(terminal.cols, 80);
      const rows = Math.max(terminal.rows, 24);

      if (terminal.cols !== cols || terminal.rows !== rows) {
        terminal.resize(cols, rows);
      }

      return { cols, rows };
    };

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const size = normalizeClientSize();
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: size.cols,
          rows: size.rows,
        }),
      );
    };

    ws.onopen = () => {
      setConnectionState("connected");
      terminal.focus();

      sendResize();

      // Run a couple of delayed fit+resize passes to avoid tiny PTY widths
      // when layout is still settling during first paint.
      window.setTimeout(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors
        }
        sendResize();
      }, 120);

      window.setTimeout(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors
        }
        sendResize();
      }, 420);

      if (initialCommand?.trim()) {
        window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            return;
          }

          const command = initialCommand.endsWith("\n")
            ? initialCommand
            : `${initialCommand}\n`;
          ws.send(command);
        }, 180);
      }
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data));
      } else if (typeof event.data === "string") {
        // Check for error messages
        try {
          const parsed = JSON.parse(event.data) as { type?: string; message?: string };
          if (parsed.type === "error") {
            terminal.writeln(`\r\n\x1b[31mError: ${parsed.message}\x1b[0m\r\n`);
            setErrorMessage(parsed.message || "Unknown error");
            setConnectionState("error");
            return;
          }
        } catch {
          // Not JSON, just text
        }
        terminal.write(event.data);
      }
    };

    ws.onclose = (event) => {
      if (connectionState !== "error") {
        terminal.writeln("\r\n\x1b[33mConnection closed.\x1b[0m\r\n");
        setConnectionState("disconnected");
      }
      console.log("WebSocket closed:", event.code, event.reason);
    };

    ws.onerror = () => {
      terminal.writeln("\r\n\x1b[31mConnection error.\x1b[0m\r\n");
      setConnectionState("error");
      setErrorMessage("Failed to connect to terminal server");
    };

    // Terminal input → WebSocket
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      const safeCols = Math.max(cols, 80);
      const safeRows = Math.max(rows, 24);

      if (safeCols !== cols || safeRows !== rows) {
        terminal.resize(safeCols, safeRows);
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: safeCols,
            rows: safeRows,
          }),
        );
      }
    });
  }, [instanceId, userId, initialCommand, connectionState]);

  // Auto-connect on mount
  useEffect(() => {
    void connect();

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore fit errors
        }
      }

      const terminal = termInstanceRef.current;
      const ws = wsRef.current;
      if (terminal) {
        const safeCols = Math.max(terminal.cols, 80);
        const safeRows = Math.max(terminal.rows, 24);

        if (safeCols !== terminal.cols || safeRows !== terminal.rows) {
          terminal.resize(safeCols, safeRows);
        }

        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: safeCols,
              rows: safeRows,
            }),
          );
        }
      }
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && terminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      wsRef.current?.close();
      termInstanceRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReconnect = () => {
    wsRef.current?.close();
    void connect();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1b26] border-b border-[#33467c] rounded-t-xl">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionState === "connected"
                ? "bg-green-400"
                : connectionState === "connecting"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-red-400"
            }`}
          />
          <span className="text-xs text-[#a9b1d6] font-mono">
            {connectionState === "connected"
              ? "Connected"
              : connectionState === "connecting"
                ? "Connecting..."
                : connectionState === "error"
                  ? "Error"
                  : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(connectionState === "disconnected" ||
            connectionState === "error") && (
            <button
              onClick={handleReconnect}
              className="text-xs text-[#7aa2f7] hover:text-[#7dcfff] font-mono transition-colors"
            >
              Reconnect
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-[#a9b1d6] hover:text-[#f7768e] font-mono transition-colors"
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 bg-[#1a1b26] rounded-b-xl overflow-hidden"
        style={{ minHeight: "300px" }}
      />

      {errorMessage && (
        <div className="px-4 py-2 bg-red-900/30 text-red-300 text-xs font-mono">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
