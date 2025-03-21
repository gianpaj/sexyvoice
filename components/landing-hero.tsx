'use client';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

function LandingHero() {
  return (
    <div className="sm:pb-8 pb-6 flex justify-center">
      <DotLottieReact
        className="sm:w-52 w-36"
        src="https://assets1.lottiefiles.com/packages/lf20_1xbk4d2v.json"
        loop
        autoplay
        speed={0.66}
      />
    </div>
  );
}

export default LandingHero;
