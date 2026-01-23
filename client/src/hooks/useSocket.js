import { useContext } from "react";
import { useSocketContext } from "../contexts/SocketProvider";

/*
  Simple hook alias.
  Use this in components instead of calling io(...) directly.
*/
export default function useSocket() {
  return useSocketContext();
}