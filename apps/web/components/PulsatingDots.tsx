const PulsatingDots = () => (
  <span className="mb-3 ml-2 inline-flex text-4xl">
    <span className="animate-[pulse_1.4s_ease-in-out_infinite]">.</span>
    <span className="animate-[pulse_1.4s_ease-in-out_0.4s_infinite]">.</span>
    <span className="animate-[pulse_1.4s_ease-in-out_0.8s_infinite]">.</span>
  </span>
);

export default PulsatingDots;
