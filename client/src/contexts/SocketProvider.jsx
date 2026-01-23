import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

/*
  SocketProvider
  - creates one socket instance per app (singleton)
  - exposes socket via context to be consumed with useSocket()
  - auto-connects to REACT_APP_API_URL or same origin if not set
  - closes socket on unmount
*/

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (socketRef.current) return;

    const url = process.env.REACT_APP_API_URL || window.location.origin;
    const s = io(url, {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = s;
    setSocket(s);

    // Optional: debug id when connected
    const onConnect = () => console.debug("socket connected", s.id);
    s.on("connect", onConnect);

    return () => {
      try {
        s.off("connect", onConnect);
        s.close();
      } catch (e) {}
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  return useContext(SocketContext);
}