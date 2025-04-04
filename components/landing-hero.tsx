// 'use client';
// import { DotLottieReact } from '@lottiefiles/dotlottie-react';

import './landing-hero.scss';

function LandingHero() {
  return (
    <div className="sm:pb-8 pb-6 flex justify-center">
      {/* <DotLottieReact
        className="sm:w-52 w-36"
        src="https://assets1.lottiefiles.com/packages/lf20_1xbk4d2v.json"
        loop
        autoplay
        speed={0.66}
      /> */}
      <svg
        id="wave"
        data-name="Layer 1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 98 38.05"
      >
        <title>Audio Wave</title>
        <defs>
          <linearGradient id="header-shape-gradient" x2="0.35" y2="1">
            <stop offset="0%" stop-color="var(--color-stop)" />
            <stop offset="30%" stop-color="var(--color-stop)" />
            <stop offset="100%" stop-color="var(--color-bot)" />
          </linearGradient>
        </defs>
        <path
          id="Line_1"
          d="m0.91,15l-0.13,0a1,1 0 0 0 -0.78,1l0,6a1,1 0 1 0 2,0s0,0 0,0l0,-6a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 1"
        />
        <path
          id="Line_2"
          d="m6.91,9l-0.13,0a1,1 0 0 0 -0.78,1l0,18a1,1 0 1 0 2,0s0,0 0,0l0,-18a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 2"
        />
        <path
          id="Line_3"
          d="m12.91,0l-0.13,0a1,1 0 0 0 -0.78,1l0,36a1,1 0 1 0 2,0s0,0 0,0l0,-36a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 3"
        />
        <path
          id="Line_4"
          d="m18.91,10l-0.12,0a1,1 0 0 0 -0.79,1l0,16a1,1 0 1 0 2,0s0,0 0,0l0,-16a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 4"
        />
        <path
          id="Line_5"
          d="m24.91,15l-0.12,0a1,1 0 0 0 -0.79,1l0,6a1,1 0 0 0 2,0s0,0 0,0l0,-6a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 5"
        />
        <path
          id="Line_6"
          d="m30.91,10l-0.12,0a1,1 0 0 0 -0.79,1l0,16a1,1 0 1 0 2,0s0,0 0,0l0,-16a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 6"
        />
        <path
          id="Line_7"
          d="m36.91,0l-0.13,0a1,1 0 0 0 -0.78,1l0,36a1,1 0 1 0 2,0s0,0 0,0l0,-36a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 7"
        />
        <path
          id="Line_8"
          d="m42.91,9l-0.13,0a1,1 0 0 0 -0.78,1l0,18a1,1 0 1 0 2,0s0,0 0,0l0,-18a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 8"
        />
        <path
          id="Line_9"
          d="m48.91,15l-0.12,0a1,1 0 0 0 -0.79,1l0,6a1,1 0 1 0 2,0s0,0 0,0l0,-6a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 9"
        />
        <path
          id="Line_10"
          d="m54.90929,9l-0.13,0a1,1 0 0 0 -0.78,1l0,18a1,1 0 1 0 2,0s0,0 0,0l0,-18a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 10"
        />
        <path
          id="Line_11"
          d="m60.90929,0l-0.13,0a1,1 0 0 0 -0.78,1l0,36a1,1 0 1 0 2,0s0,0 0,0l0,-36a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 11"
        />
        <path
          id="Line_12"
          d="m66.90929,10l-0.12,0a1,1 0 0 0 -0.79,1l0,16a1,1 0 1 0 2,0s0,0 0,0l0,-16a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 12"
        />
        <path
          id="Line_13"
          d="m72.90929,15l-0.12,0a1,1 0 0 0 -0.79,1l0,6a1,1 0 0 0 2,0s0,0 0,0l0,-6a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 13"
        />
        <path
          id="Line_14"
          d="m78.90929,10l-0.12,0a1,1 0 0 0 -0.79,1l0,16a1,1 0 1 0 2,0s0,0 0,0l0,-16a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 14"
        />
        <path
          id="Line_15"
          d="m84.90929,0l-0.13,0a1,1 0 0 0 -0.78,1l0,36a1,1 0 1 0 2,0s0,0 0,0l0,-36a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 15"
        />
        <path
          id="Line_16"
          d="m90.90929,9l-0.13,0a1,1 0 0 0 -0.78,1l0,18a1,1 0 1 0 2,0s0,0 0,0l0,-18a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 16"
        />
        <path
          id="Line_17"
          d="m96.90929,15l-0.12,0a1,1 0 0 0 -0.79,1l0,6a1,1 0 1 0 2,0s0,0 0,0l0,-6a1,1 0 0 0 -1,-1l-0.09,0z"
          data-name="Line 17"
        />
      </svg>
    </div>
  );
}

export default LandingHero;
