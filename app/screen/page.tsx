"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useAppKitProvider } from "@reown/appkit-controllers/react";
import { useSignMessage, useChainId } from "wagmi";
import bs58 from "bs58";

type Stage =
  | "consent"
  | "explanation"
  | "awaiting-connection"
  | "requesting-signature"
  | "verifying"
  | "success-redirecting"
  | "screened-out-redirecting"
  | "error";

type SolanaProvider = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

type VerifyResponse = {
  eligible: boolean;
  redirect_url: string;
};

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 align-[-2px]"
    />
  );
}

export default function ScreenPage() {
  const searchParams = useSearchParams();
  const prolificId = searchParams.get("PROLIFIC_PID");

  const { open } = useAppKit();
  const evmAccount = useAppKitAccount({ namespace: "eip155" });
  const solanaAccount = useAppKitAccount({ namespace: "solana" });
  const { walletProvider: solanaWalletProvider } =
    useAppKitProvider<SolanaProvider>("solana");
  const { signMessageAsync } = useSignMessage();
  const evmChainId = useChainId();

  const [stage, setStage] = useState<Stage>("consent");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const verificationStartedRef = useRef(false);

  const connectedChain: "evm" | "solana" | null = useMemo(() => {
    if (evmAccount?.isConnected && evmAccount.address) return "evm";
    if (solanaAccount?.isConnected && solanaAccount.address) return "solana";
    return null;
  }, [
    evmAccount?.isConnected,
    evmAccount?.address,
    solanaAccount?.isConnected,
    solanaAccount?.address,
  ]);

  const resetFlow = useCallback(() => {
    verificationStartedRef.current = false;
    setErrorMessage("");
    setStage("explanation");
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const runVerification = useCallback(async () => {
    if (!prolificId) return;
    if (verificationStartedRef.current) return;
    verificationStartedRef.current = true;

    try {
      setStage("requesting-signature");

      const nonceRes = await fetch("/api/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error("Could not start verification (nonce).");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      let address: string;
      let chain: "evm" | "solana";
      let message: string;
      let signature: string;

      if (evmAccount?.isConnected && evmAccount.address) {
        chain = "evm";
        address = evmAccount.address;
        const domain = window.location.host;
        const uri = window.location.origin;
        const chainId = evmChainId ?? 1;
        message = [
          `${domain} wants you to sign in with your Ethereum account:`,
          address,
          "",
          `Sign to verify wallet ownership for the Wayne State NFT pricing study (Prolific ID: ${prolificId}).`,
          "",
          `URI: ${uri}`,
          `Version: 1`,
          `Chain ID: ${chainId}`,
          `Nonce: ${nonce}`,
          `Issued At: ${new Date().toISOString()}`,
        ].join("\n");

        signature = await signMessageAsync({
          message,
          account: address as `0x${string}`,
        });
      } else if (solanaAccount?.isConnected && solanaAccount.address) {
        chain = "solana";
        address = solanaAccount.address;
        const domain = window.location.host;
        message = [
          `${domain} requests wallet verification for the Wayne State NFT pricing study.`,
          "",
          `Address: ${address}`,
          `Prolific ID: ${prolificId}`,
          `Nonce: ${nonce}`,
          `Issued At: ${new Date().toISOString()}`,
        ].join("\n");

        if (!solanaWalletProvider) {
          throw new Error("Solana wallet provider unavailable.");
        }
        const sigBytes = await solanaWalletProvider.signMessage(
          new TextEncoder().encode(message),
        );
        signature = bs58.encode(sigBytes);
      } else {
        throw new Error("No connected wallet found.");
      }

      setStage("verifying");

      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prolific_id: prolificId,
          address,
          chain,
          message,
          signature,
        }),
      });

      if (!verifyRes.ok) {
        const errBody = (await verifyRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errBody.error ||
            `Verification failed (status ${verifyRes.status}). Please try again.`,
        );
      }

      const data = (await verifyRes.json()) as VerifyResponse;
      setStage(
        data.eligible ? "success-redirecting" : "screened-out-redirecting",
      );
      setTimeout(() => {
        window.location.replace(data.redirect_url);
      }, 1200);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setStage("error");
      verificationStartedRef.current = false;
    }
  }, [
    prolificId,
    evmAccount?.isConnected,
    evmAccount?.address,
    evmChainId,
    solanaAccount?.isConnected,
    solanaAccount?.address,
    solanaWalletProvider,
    signMessageAsync,
  ]);

  useEffect(() => {
    if (stage === "awaiting-connection" && connectedChain) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runVerification();
    }
  }, [stage, connectedChain, runVerification]);

  if (!prolificId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Missing Prolific participant ID
        </h1>
        <p className="mt-4 text-neutral-700">
          This page can only be accessed through your Prolific study link. The
          link should include a <code>PROLIFIC_PID</code> query parameter.
          Please return to your Prolific dashboard and follow the study link
          provided there.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Wallet Verification for Academic Study
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Wayne State University &middot; IRB-approved research
        </p>
      </header>

      {stage === "consent" && (
        <ConsentPane onContinue={() => setStage("explanation")} />
      )}

      {stage === "explanation" && (
        <ExplanationPane
          onConnect={async () => {
            setStage("awaiting-connection");
            try {
              await open();
            } catch {
              // Modal close from user; revert
              setStage("explanation");
            }
          }}
        />
      )}

      {stage === "awaiting-connection" && (
        <StatusPane title="Connecting to your wallet">
          A wallet selection dialog should be open. Choose the wallet you
          would like to use, then approve the connection.
        </StatusPane>
      )}

      {stage === "requesting-signature" && (
        <StatusPane title="Please approve the signature request">
          Your wallet should be prompting you to sign a one-time verification
          message. Signing this message does not authorise any transaction or
          transfer of funds. It only proves that you control this wallet.
        </StatusPane>
      )}

      {stage === "verifying" && (
        <StatusPane title="Verifying NFT holdings">
          Checking publicly available NFT records on Ethereum, Polygon, Base,
          and Solana mainnet. This typically takes a few seconds.
        </StatusPane>
      )}

      {stage === "success-redirecting" && (
        <ResultPane
          title="Verification complete"
          tone="success"
          message="You meet the eligibility criteria for this study. Redirecting you back to Prolific now…"
        />
      )}

      {stage === "screened-out-redirecting" && (
        <ResultPane
          title="Thank you for your interest"
          tone="info"
          message="Based on the eligibility criteria for this study, you have not been selected to continue. Redirecting you back to Prolific now…"
        />
      )}

      {stage === "error" && (
        <ErrorPane message={errorMessage} onRetry={resetFlow} />
      )}
    </div>
  );
}

function ConsentPane({ onContinue }: { onContinue: () => void }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">Research Information Sheet</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Non-Fungible Tokens (NFT) Pricing: A Mixed Method Approach
      </p>

      <div className="mt-6 space-y-4 text-sm leading-6 text-neutral-800">
        <p>
          <strong>Principal Investigators:</strong> Dr Ahmed Mohamadean and Dr
          Kwame Porter Robinson, 2771 Woodward Ave #465, Detroit, MI 48201,
          410-800-8741.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">Introduction</h3>
        <p>
          You are being asked to participate in a research study. The purpose
          of this form is to provide you with information that may affect your
          decision as to whether or not to participate. Your participation is
          entirely voluntary, and you can refuse to participate at any time
          without penalty.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          What is this study about and why is it being done?
        </h3>
        <p>
          Non-fungible tokens (NFTs) serve as proofs of digital ownership for
          specific assets, including artworks, music, videos, and
          collectibles. Unlike traditional assets like stocks or gold, pricing
          NFTs involves unexplored aspects related to how users perceive and
          value these digital assets, beyond their intrinsic value or
          fundamental analysis.
        </p>
        <p>
          This study aims to answer the following question: How do users
          price NFTs? We aim to identify new factors influencing the pricing
          of digital assets that have not been previously explored, and to
          assess the relevance of established factors and biases that may
          impact NFT pricing decisions.
        </p>
        <p>
          You are being asked to participate because you are an adult (18
          years or older) who uses, creates, or transacts using NFTs. The
          estimated number of study participants is approximately eighty
          (80).
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          What will I do and how long will it take?
        </h3>
        <p>
          This study consists of three parts: qualitative interviews, a
          survey study, and experimental tasks. You may be asked to
          participate in one or more of these components.
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Qualitative interviews (40–50 minutes):</strong> a
            semi-structured Zoom discussion about how you form pricing
            decisions for NFTs as a buyer, seller, or creator. The interview
            will be recorded and transcribed for analysis. Before recording
            begins, you will be asked to provide consent, and all data will
            be de-identified before analysis.
          </li>
          <li>
            <strong>Survey study (20–25 minutes):</strong> an online
            questionnaire accessed through a research-designed URL. Consent
            is collected automatically on the first page of the survey.
          </li>
          <li>
            <strong>Experimental interface (up to 60 minutes):</strong> an
            interface designed to test how various factors affect pricing
            decisions for NFTs. This is hosted on an external cloud service
            provider, and your responses are recorded and analysed. Consent
            is collected automatically at the beginning of the experiment.
          </li>
        </ol>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Screening process
        </h3>
        <p>
          All participants are prompted to answer screening questions about
          their use of NFTs to ensure they are the targeted participants of
          this study. Through a posted link you will be required to share
          evidence of buying, selling, or generating an NFT on selected major
          platforms. The researchers will assess each submission and send an
          invitation only to those individuals who are qualified.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Possible benefits
        </h3>
        <p>
          <strong>Direct benefits:</strong> participants in the interview
          portion will receive a copy of the study&rsquo;s interview results,
          which may help them make more informed pricing decisions for NFTs.
        </p>
        <p>
          <strong>Indirect benefits to society:</strong> the findings will
          inform users about factors that influence the pricing decisions of
          NFTs, contributing to a deeper understanding of digital asset
          valuation.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Risks and discomforts
        </h3>
        <p>
          The risks are similar to those encountered in everyday life. The
          primary risk is the potential loss of confidentiality. We minimise
          this risk by removing all identifying information and replacing it
          with a study ID, and by storing all electronic data on
          password-protected, encrypted computers and secure cloud services.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Cost and compensation
        </h3>
        <p>
          There is no cost for participating. Each participant who completes
          the interview portion will receive a $50 gift card. Compensation
          for the survey and experimental portions is determined separately
          if applicable.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Confidentiality and future use
        </h3>
        <p>
          You will be identified in the research records by a code name or
          number. There will be no list that links your identity with this
          code. All data will be de-identified before analysis and storage.
          For the qualitative interviews, Zoom recordings will be stored
          temporarily, transcribed, and then securely deleted. For the survey
          and experimental studies, data will be collected through secure
          research URLs and hosted on external cloud service providers with
          appropriate security measures.
        </p>
        <p>
          In accordance with scientific norms, the de-identified data may be
          used or shared with other researchers for future research related
          to digital asset pricing and user behaviour.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Voluntary participation
        </h3>
        <p>
          Participation is entirely voluntary. You are free not to answer any
          questions or to withdraw at any time without penalty. Your decision
          will not change any present or future relationship with Wayne State
          University or its affiliates.
        </p>

        <h3 className="mt-4 font-semibold text-neutral-900">
          Questions and contact information
        </h3>
        <p>
          If you have any questions about this study now or in the future,
          please contact the Principal Investigators at{" "}
          <a className="underline" href="mailto:ahmed.m@wayne.edu">
            ahmed.m@wayne.edu
          </a>{" "}
          or{" "}
          <a className="underline" href="mailto:kwamepr@wayne.edu">
            kwamepr@wayne.edu
          </a>
          . This research has been reviewed and approved by an Institutional
          Review Board (IRB). To speak with someone other than a member of
          the research staff, or to share feedback privately with the IRB,
          call the Research Participants&rsquo; Advocate at{" "}
          <a className="underline" href="tel:+13135771628">
            (313) 577-1628
          </a>{" "}
          or email{" "}
          <a className="underline" href="mailto:irbquestions@wayne.edu">
            irbquestions@wayne.edu
          </a>
          .
        </p>

        <p className="text-xs text-neutral-500">
          A copy of this Information Sheet is available for you to keep.
          Please save or print a copy for your records.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex w-full justify-center rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto"
        >
          I have read this information and consent to participate
        </button>
        <p className="text-xs text-neutral-500">
          If you do not consent, please close this tab.
        </p>
      </div>
    </section>
  );
}

function ExplanationPane({ onConnect }: { onConnect: () => void }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">
        How wallet verification works
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-6 text-neutral-800">
        <p>
          To confirm your eligibility for this study, we need to check that
          your wallet currently holds at least one NFT on Ethereum, Polygon,
          Base, or Solana mainnet. To do this we will:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            Open a wallet-selection dialog so you can choose your wallet
            (MetaMask, Phantom, Coinbase Wallet, and other compatible
            wallets).
          </li>
          <li>
            Ask you to sign a short, one-time verification message inside
            your wallet. This is purely a cryptographic proof that you
            control the wallet&rsquo;s public address. It does not authorise
            any payment, transfer, or transaction.
          </li>
          <li>
            Use your wallet&rsquo;s public address to look up its NFT
            holdings through Alchemy, a public blockchain data provider.
          </li>
          <li>
            Redirect you back to Prolific. If your wallet holds an NFT, you
            will be sent to the study completion URL; otherwise, you will be
            sent to the screened-out URL.
          </li>
        </ol>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="font-semibold text-neutral-900">
            Your private keys are never exposed.
          </p>
          <p className="mt-1 text-neutral-700">
            We never see, request, or store your seed phrase or private keys.
            We only see the public wallet address and the signed verification
            message. You can disconnect at any time from within your wallet.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex w-full justify-center rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto"
        >
          Connect Wallet
        </button>
      </div>
    </section>
  );
}

function StatusPane({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-neutral-200 p-6">
      <div className="flex items-center gap-3">
        <Spinner />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-700">{children}</p>
    </section>
  );
}

function ResultPane({
  title,
  tone,
  message,
}: {
  title: string;
  tone: "success" | "info";
  message: string;
}) {
  const accent =
    tone === "success" ? "border-green-200 bg-green-50" : "border-neutral-200";
  return (
    <section className={`rounded-md border p-6 ${accent}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-700">{message}</p>
    </section>
  );
}

function ErrorPane({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-md border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-900">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm leading-6 text-red-900">{message}</p>
      <p className="mt-2 text-sm leading-6 text-red-900">
        If the problem persists, try a different wallet or refresh the page.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex justify-center rounded-md bg-red-900 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
      >
        Try again
      </button>
    </section>
  );
}
