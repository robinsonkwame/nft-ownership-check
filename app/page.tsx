export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Wayne State NFT Pricing Study
      </h1>
      <p className="mt-4 text-neutral-700">
        This page is part of an academic research study on how users price
        non-fungible tokens (NFTs). Participants are recruited through Prolific
        and arrive here through a study-specific link.
      </p>
      <p className="mt-4 text-neutral-700">
        If you are participating in this study, please return to your Prolific
        dashboard and follow the link provided there. The screening URL
        requires a Prolific participant ID and will not function if visited
        directly.
      </p>
      <p className="mt-4 text-sm text-neutral-500">
        Researchers and IRB staff: see{" "}
        <code className="font-mono">/screen?PROLIFIC_PID=…</code> for the
        participant flow.
      </p>
    </div>
  );
}
