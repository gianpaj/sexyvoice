const PulsatingDots = () => (
  <span className="inline-flex ml-2 text-4xl mb-3">
    <span className="animate-[pulse_1.4s_ease-in-out_infinite]">.</span>
    <span className="animate-[pulse_1.4s_ease-in-out_0.4s_infinite]">.</span>
    <span className="animate-[pulse_1.4s_ease-in-out_0.8s_infinite]">.</span>
  </span>
);

export default PulsatingDots;
