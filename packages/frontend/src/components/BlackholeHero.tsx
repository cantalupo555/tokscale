"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { StarIcon } from "@primer/octicons-react";

export function BlackholeHero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npx tokscale");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full max-w-7xl mx-auto mb-10 overflow-hidden rounded-2xl h-[424px]">
      <div className="absolute inset-0 z-0">
        <Image
          src="/assets/hero-bg.png"
          alt="Hero Background"
          fill
          className="object-cover"
          priority
        />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center pt-[53px]">
        <div className="relative w-[173px] h-[36px]">
          <Image
            src="/assets/hero-logo.svg"
            alt="Tokscale Logo"
            fill
            className="object-contain"
          />
        </div>

        <h1
          className="text-[48px] font-bold text-white text-center leading-[1.1] mt-[39px]"
          style={{
            fontFamily: "Figtree, var(--font-geist-sans), sans-serif",
            textShadow: "0px 4px 24px rgba(0, 0, 0, 0.4)",
          }}
        >
          The Kardashev Scale
          <br />
          for AI Devs
        </h1>

        <div
          className="mt-[39px] flex items-center gap-1.5 p-2 rounded-xl border backdrop-blur-sm"
          style={{
            width: "296px",
            height: "56px",
            backgroundColor: "#141415",
            borderColor: "rgba(49, 56, 65, 0.4)",
          }}
        >
          <button
            onClick={handleCopy}
            className="flex items-center justify-center rounded-lg transition-all hover:opacity-90 active:scale-95"
            style={{
              backgroundColor: "#0073FF",
              height: "36px",
              width: "86px",
            }}
          >
            <span className="text-[15px] font-bold text-white leading-none tracking-tight">
              {copied ? "Copied" : "Copy"}
            </span>
          </button>
          
          <div className="flex-1 flex items-center justify-center relative overflow-hidden h-[36px] bg-[#1A1B1C] rounded-lg">
            <span className="text-base font-bold text-white leading-none tracking-tight font-mono z-10">
              npx tokscale
            </span>
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#017FFF]/15 to-transparent pointer-events-none" />
          </div>
        </div>

        <div className="mt-auto mb-[45px] flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <StarIcon size={20} fill="#FFFFFF" className="text-white" />
            <span
              className="text-lg font-bold text-white tracking-tight"
              style={{ fontFamily: "Figtree, var(--font-geist-sans), sans-serif" }}
            >
              Star me on GitHub!
            </span>
          </div>
          <Link
            href="https://github.com/junhoyeo/tokscale"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold tracking-tight transition-colors hover:text-white"
            style={{
              color: "#696969",
              fontFamily: "Figtree, var(--font-geist-sans), sans-serif"
            }}
          >
            junhoyeo/tokscale
          </Link>
        </div>
      </div>
    </div>
  );
}
