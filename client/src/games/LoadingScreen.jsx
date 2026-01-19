import React from "react";
import cyblogolight from "../assets/cyblogolight.png";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-950 z-50">

      <div className="animate-bounce"><img height={200} width={200} src={cyblogolight} alt="" /></div>
      <span className="sr-only ">Loading...</span>
    </div>
  );
}

export default LoadingScreen;