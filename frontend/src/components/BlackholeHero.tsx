"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const BlackholeBackground = dynamic(
  () => import("@junhoyeo/blackhole").then((mod) => mod.BlackholeBackground),
  { ssr: false }
);

export function BlackholeHero() {
  const [key, setKey] = useState(0);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setKey((k) => k + 1), 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div
      className="relative w-full max-w-7xl mx-auto mb-10 overflow-hidden rounded-2xl"
      style={{
        height: "420px",
        backgroundColor: "#000",
      }}
    >
      <div
        className="absolute"
        style={{
          width: "max(100%, 900px)",
          height: "100%",
          left: "50%",
          top: 0,
          transform: "translateX(-50%)",
        }}
      >
        <BlackholeBackground
          key={key}
          quality="high"
          cameraDistance={10}
          fieldOfView={90}
          enableOrbit={true}
          showAccretionDisk={true}
          useDiskTexture={true}
          enableLorentzTransform={true}
          enableDopplerShift={true}
          enableBeaming={true}
          bloomStrength={0.5}
          bloomRadius={0.3}
          bloomThreshold={0.8}
          backgroundTextureUrl="/assets/milkyway.jpg"
          starTextureUrl="/assets/star_noise.png"
          diskTextureUrl="/assets/accretion_disk.png"
        />
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)",
        }}
      >
        <h1
          className="text-4xl md:text-5xl font-bold mb-3"
          style={{ color: "#FFFFFF", textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}
        >
          Token Tracker
        </h1>
        <p
          className="text-lg md:text-xl max-w-md px-4"
          style={{ color: "rgba(255,255,255,0.8)", textShadow: "0 1px 10px rgba(0,0,0,0.8)" }}
        >
          Track your AI token usage across all platforms
        </p>
      </div>
    </div>
  );
}
