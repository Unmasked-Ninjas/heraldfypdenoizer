import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  confirmKhaltiPayment,
  consumeDenoiseCredits,
  createAudioHistoryEntry,
  deleteAudioHistoryEntry,
  fetchCreditPackages,
  fetchAudioHistory,
  initiateKhaltiPayment,
  uploadHistoryAssets,
} from "../services/authApi";

const CREDITS_PER_DENOISE = 5;

export default function DenoiserView({
  userEmail,
  userCredits,
  onCreditsChange,
  onLogout,
}) {
  const [file, setFile] = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [previewSourcesByHistoryId, setPreviewSourcesByHistoryId] = useState(
    {},
  );
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState("denoised");
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState(null);
  const [historyDeleteLoading, setHistoryDeleteLoading] = useState(false);
  const [creditError, setCreditError] = useState("");
  const [buyCreditsLoading, setBuyCreditsLoading] = useState(false);
  const [creditPackagesLoading, setCreditPackagesLoading] = useState(false);
  const [showCreditPackageModal, setShowCreditPackageModal] = useState(false);
  const [creditPackages, setCreditPackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [buyCreditsError, setBuyCreditsError] = useState("");
  const [buyCreditsSuccess, setBuyCreditsSuccess] = useState("");
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const previewSourcesRef = useRef({});

  useEffect(() => {
    previewSourcesRef.current = previewSourcesByHistoryId;
  }, [previewSourcesByHistoryId]);

  const loadHistory = async () => {
    try {
      const items = await fetchAudioHistory(8);
      setHistoryItems(items);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message || "Could not load audio history.");
    }
  };

  useEffect(() => {
    loadHistory();
  }, [userEmail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("pidx") || params.get("idx");
    const khaltiKeys = [
      "pidx",
      "idx",
      "token",
      "t",
      "bank_reference",
      "merchant_extra",
      "transaction_id",
      "tidx",
      "amount",
      "mobile",
      "purchase_order_id",
      "purchase_order_name",
      "status",
      "total_amount",
    ];
    const hasKhaltiParams = khaltiKeys.some((key) => params.has(key));
    if (!paymentId && !hasKhaltiParams) return;

    const verifyPayment = async () => {
      if (!paymentId) return;
      setBuyCreditsLoading(true);
      setBuyCreditsError("");
      try {
        const result = await confirmKhaltiPayment({ pidx: paymentId });
        if (typeof onCreditsChange === "function") {
          onCreditsChange(result.credits || 0);
        }
        setBuyCreditsSuccess(result.message || "Credits added successfully.");
      } catch (error) {
        setBuyCreditsError(error.message || "Could not verify Khalti payment.");
      } finally {
        setBuyCreditsLoading(false);
      }
    };

    verifyPayment();

    khaltiKeys.forEach((key) => params.delete(key));

    const cleanQuery = params.toString();
    const nextUrl = cleanQuery
      ? `${window.location.pathname}?${cleanQuery}`
      : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }, [onCreditsChange]);

  useEffect(() => {
    return () => {
      Object.values(previewSourcesRef.current).forEach((sources) => {
        if (sources?.originalUrl) URL.revokeObjectURL(sources.originalUrl);
        if (sources?.denoisedUrl) URL.revokeObjectURL(sources.denoisedUrl);
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [outputUrl]);

  useEffect(() => {
    if (!buyCreditsSuccess) return;

    const timeoutId = setTimeout(() => {
      setBuyCreditsSuccess("");
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [buyCreditsSuccess]);

  useEffect(() => {
    if (loading) {
      setProgress(0);
      timerRef.current = setInterval(() => {
        setProgress((p) => (p < 90 ? p + Math.random() * 8 : p));
      }, 400);
    } else {
      setProgress(100);
      setTimeout(() => setProgress(0), 800);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [loading]);

  const handleFile = (f) => {
    if (f && f.type.startsWith("audio/")) {
      setFile(f);
      setOutputUrl(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    if (userCredits < CREDITS_PER_DENOISE) {
      setCreditError("Not enough credits. Please upgrade to continue.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    setOutputUrl(null);
    setCreditError("");
    const startedAt = Date.now();
    const originalPreviewUrl = URL.createObjectURL(file);

    try {
      try {
        const creditsResult = await consumeDenoiseCredits();
        if (typeof onCreditsChange === "function") {
          onCreditsChange(creditsResult.credits || 0);
        }
      } catch (creditUseError) {
        if (creditUseError?.code === 402) {
          if (typeof onCreditsChange === "function") {
            onCreditsChange(creditUseError.credits || 0);
          }
          setCreditError(creditUseError.message);
        } else {
          setCreditError(
            creditUseError.message || "Could not consume credits.",
          );
        }
        return;
      }

      const response = await axios.post(
        "http://localhost:8000/denoise/",
        formData,
        { responseType: "blob" },
      );
      const denoisedBlob = new Blob([response.data], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(denoisedBlob);
      const denoisedPreviewUrl = URL.createObjectURL(denoisedBlob);
      setOutputUrl(audioUrl);

      try {
        const uploadedAssets = await uploadHistoryAssets({
          originalFile: file,
          denoisedBlob,
        });

        const createdEntry = await createAudioHistoryEntry({
          originalFilename: file.name,
          originalSizeBytes: file.size,
          denoisedFilename: "denoised.wav",
          originalFileUrl: uploadedAssets.originalFileUrl,
          denoisedFileUrl: uploadedAssets.denoisedFileUrl,
          modelName: "UNet",
          status: "completed",
          processingMs: Date.now() - startedAt,
        });

        setPreviewSourcesByHistoryId((prev) => ({
          ...prev,
          [createdEntry.id]: {
            originalUrl: originalPreviewUrl,
            denoisedUrl: denoisedPreviewUrl,
          },
        }));

        await loadHistory();
      } catch (historySaveError) {
        console.warn("History save failed:", historySaveError);
        URL.revokeObjectURL(originalPreviewUrl);
        URL.revokeObjectURL(denoisedPreviewUrl);
        setHistoryError(
          historySaveError.message ||
            "Audio was denoised, but history could not be saved.",
        );
      }
    } catch (error) {
      console.error("Upload failed:", error);

      try {
        const uploadedAssets = await uploadHistoryAssets({
          originalFile: file,
          denoisedBlob: null,
        });

        const createdEntry = await createAudioHistoryEntry({
          originalFilename: file.name,
          originalSizeBytes: file.size,
          originalFileUrl: uploadedAssets.originalFileUrl,
          modelName: "UNet",
          status: "failed",
          processingMs: Date.now() - startedAt,
          errorMessage: "Denoise request failed.",
        });

        setPreviewSourcesByHistoryId((prev) => ({
          ...prev,
          [createdEntry.id]: {
            originalUrl: originalPreviewUrl,
            denoisedUrl: null,
          },
        }));

        await loadHistory();
      } catch (historySaveError) {
        console.warn("History save failed:", historySaveError);
        URL.revokeObjectURL(originalPreviewUrl);
        setHistoryError(
          historySaveError.message ||
            "Could not save failed attempt to history.",
        );
      }

      alert(
        "Could not connect to backend. Make sure FastAPI server is running.",
      );
    } finally {
      setLoading(false);
    }
  };

  const clearSelectedFile = (e) => {
    e.stopPropagation();
    setFile(null);
    setOutputUrl(null);
  };

  const openCreditPackageModal = async () => {
    setBuyCreditsSuccess("");
    setBuyCreditsError("");
    setCreditPackagesLoading(true);
    try {
      const packages = await fetchCreditPackages();
      if (!packages.length) {
        throw new Error("No credit package available right now.");
      }

      setCreditPackages(packages);
      setSelectedPackageId(packages[0].id);
      setShowCreditPackageModal(true);
    } catch (error) {
      setBuyCreditsError(error.message || "Could not load credit packages.");
    } finally {
      setCreditPackagesLoading(false);
    }
  };

  const closeCreditPackageModal = () => {
    if (buyCreditsLoading) return;
    setShowCreditPackageModal(false);
  };

  const handleAddCredits = async () => {
    if (!selectedPackageId) {
      setBuyCreditsError("Please select a package first.");
      return;
    }

    setBuyCreditsSuccess("");
    setBuyCreditsError("");
    setBuyCreditsLoading(true);
    try {
      const paymentSession = await initiateKhaltiPayment({
        packageId: selectedPackageId,
      });

      if (!paymentSession?.paymentUrl) {
        throw new Error("Khalti did not return a payment URL.");
      }

      setShowCreditPackageModal(false);
      window.location.href = paymentSession.paymentUrl;
    } catch (error) {
      setBuyCreditsError(error.message || "Could not start Khalti payment.");
    } finally {
      setBuyCreditsLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  const renderHistoryPanel = (extraClasses = "") => (
    <div
      className={`bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 h-fit ${extraClasses}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="mono text-xs text-emerald-400 tracking-widest uppercase">
          Recent Audio History
        </span>
      </div>

      {historyError && (
        <p className="mono text-xs text-red-400 mb-3">{historyError}</p>
      )}

      {historyItems.length === 0 ? (
        <p className="mono text-xs text-zinc-500">No history yet.</p>
      ) : (
        <div className="space-y-3">
          {historyItems.map((item) => (
            <div
              key={item.id}
              onClick={() => openHistoryComparison(item)}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-300 truncate">
                  {item.original_filename}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`mono text-[10px] uppercase tracking-widest ${
                      item.status === "completed"
                        ? "text-emerald-400"
                        : item.status === "failed"
                          ? "text-red-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {item.status}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => openDeleteConfirmation(event, item)}
                    className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-900"
                    aria-label="Delete history entry"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="mono text-[10px] text-zinc-500 mt-1">
                {item.original_size_bytes
                  ? formatSize(item.original_size_bytes)
                  : "Unknown size"}
                {" · "}
                {formatTime(item.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const openHistoryComparison = (item) => {
    setSelectedHistoryItem(item);

    const sources = previewSourcesByHistoryId[item.id] || {};
    if (sources.denoisedUrl) {
      setSelectedTrack("denoised");
    } else {
      setSelectedTrack("original");
    }
  };

  const closeHistoryComparison = () => {
    setSelectedHistoryItem(null);
  };

  const openDeleteConfirmation = (event, item) => {
    event.stopPropagation();
    setHistoryDeleteTarget(item);
  };

  const closeDeleteConfirmation = () => {
    if (historyDeleteLoading) return;
    setHistoryDeleteTarget(null);
  };

  const confirmDeleteHistory = async () => {
    if (!historyDeleteTarget) return;

    setHistoryDeleteLoading(true);
    try {
      await deleteAudioHistoryEntry(historyDeleteTarget.id);

      setHistoryItems((prev) =>
        prev.filter((item) => item.id !== historyDeleteTarget.id),
      );

      setPreviewSourcesByHistoryId((prev) => {
        const next = { ...prev };
        const sources = next[historyDeleteTarget.id];
        if (sources?.originalUrl) URL.revokeObjectURL(sources.originalUrl);
        if (sources?.denoisedUrl) URL.revokeObjectURL(sources.denoisedUrl);
        delete next[historyDeleteTarget.id];
        return next;
      });

      if (selectedHistoryItem?.id === historyDeleteTarget.id) {
        closeHistoryComparison();
      }

      setHistoryDeleteTarget(null);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message || "Could not delete history entry.");
    } finally {
      setHistoryDeleteLoading(false);
    }
  };

  const selectedSources = selectedHistoryItem
    ? previewSourcesByHistoryId[selectedHistoryItem.id]
    : null;

  const selectedOriginalSrc =
    selectedSources?.originalUrl || selectedHistoryItem?.original_file_url;
  const selectedDenoisedSrc =
    selectedSources?.denoisedUrl || selectedHistoryItem?.denoised_file_url;

  const activeAudioSrc =
    selectedTrack === "original" ? selectedOriginalSrc : selectedDenoisedSrc;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center px-4 py-12">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
        * { font-family: 'Syne', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          70% { transform: scale(1.05); opacity: 0.4; }
          100% { transform: scale(0.95); opacity: 1; }
        }
        @keyframes waveform {
          0%, 100% { height: 8px; }
          50% { height: 28px; }
        }
        .wave-bar { animation: waveform 1s ease-in-out infinite; }
        .wave-bar:nth-child(1) { animation-delay: 0s; }
        .wave-bar:nth-child(2) { animation-delay: 0.1s; }
        .wave-bar:nth-child(3) { animation-delay: 0.2s; }
        .wave-bar:nth-child(4) { animation-delay: 0.3s; }
        .wave-bar:nth-child(5) { animation-delay: 0.4s; }
        .wave-bar:nth-child(6) { animation-delay: 0.3s; }
        .wave-bar:nth-child(7) { animation-delay: 0.2s; }
        .wave-bar:nth-child(8) { animation-delay: 0.1s; }
      `}</style>

      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-12 py-3 ...">
        <span className="mono text-[20px] text-zinc-300">
          Credits: <span className="text-emerald-400">{userCredits}</span>
        </span>
        <button
          type="button"
          onClick={openCreditPackageModal}
          disabled={buyCreditsLoading || creditPackagesLoading}
          className="mono text-[10px] uppercase tracking-wider border border-zinc-700 text-zinc-300 px-2 py-1 rounded-md hover:border-emerald-400 hover:text-emerald-400 transition-colors"
        >
          {creditPackagesLoading ? "Loading..." : "Add Credit"}
        </button>
      </div>

      {buyCreditsError && (
        <p className="mono text-xs text-red-400 mb-3 text-center">
          {buyCreditsError}
        </p>
      )}

      {buyCreditsSuccess && (
        <p className="mono text-xs text-emerald-400 mb-3 text-center">
          {buyCreditsSuccess}
        </p>
      )}

      {showCreditPackageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0f1017] p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="mono text-[11px] text-emerald-400 uppercase tracking-[0.2em]">
                  Buy Credits
                </p>
                <h3 className="text-lg font-semibold text-zinc-100 mt-1">
                  Select a Package
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCreditPackageModal}
                className="mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {creditPackages.map((pkg) => (
                <label
                  key={pkg.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    selectedPackageId === pkg.id
                      ? "border-emerald-400 bg-emerald-400/10"
                      : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
                  }`}
                >
                  <div>
                    <p className="text-sm text-zinc-200 font-semibold">
                      {pkg.name}
                    </p>
                    <p className="mono text-[11px] text-zinc-400 mt-1">
                      {pkg.credits} credits
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="mono text-xs text-zinc-300">
                      NPR{" "}
                      {(Number(pkg.amountPaisa || 0) / 100).toLocaleString()}
                    </p>
                    <input
                      type="radio"
                      name="creditPackage"
                      checked={selectedPackageId === pkg.id}
                      onChange={() => setSelectedPackageId(pkg.id)}
                      className="accent-emerald-400"
                    />
                  </div>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddCredits}
              disabled={buyCreditsLoading || !selectedPackageId}
              className={`mt-5 w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300 ${
                buyCreditsLoading || !selectedPackageId
                  ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-emerald-400 text-black hover:bg-emerald-300"
              }`}
            >
              {buyCreditsLoading ? "Redirecting..." : "Continue to Khalti"}
            </button>
          </div>
        </div>
      )}

      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div
            className="w-2 h-2 rounded-full bg-emerald-400"
            style={{ animation: "pulse-ring 2s ease-in-out infinite" }}
          />

          <span className="mono text-xs text-emerald-400 tracking-[0.3em] uppercase">
            Neural Audio Enhancement
          </span>
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-white">
          Speech<span className="text-emerald-400">Denoizer</span>
        </h1>
        <p className="mt-3 text-sm text-zinc-500 mono">
          Powered by a custom UNet model trained on the Deep Noise Suppression
        </p>
      </div>

      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <span className="mono text-[11px] text-zinc-500 truncate pr-2">
            Signed in as <span className="text-emerald-400">{userEmail}</span>
          </span>
        </div>
        <button
          onClick={onLogout}
          className="mono text-[11px] uppercase tracking-wider text-zinc-400 hover:text-emerald-400 transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="w-full max-w-lg">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
            ${
              dragOver
                ? "border-emerald-400 bg-emerald-400/5"
                : file
                  ? "border-zinc-600 bg-zinc-900/60"
                  : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500 hover:bg-zinc-900/60"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-end gap-1 h-8">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="wave-bar w-1.5 bg-emerald-400 rounded-full"
                  />
                ))}
              </div>
              <div>
                <p className="text-white font-semibold text-sm truncate max-w-xs">
                  {file.name}
                </p>
                <p className="mono text-xs text-zinc-500 mt-1">
                  {formatSize(file.size)}
                </p>
              </div>
              <button
                onClick={clearSelectedFile}
                className="mono text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
              >
                x remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-1">
                <svg
                  className="w-6 h-6 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <div>
                <p className="text-zinc-300 text-sm font-semibold">
                  Drop audio file here
                </p>
                <p className="mono text-xs text-zinc-600 mt-1">
                  or click to browse · wav.
                </p>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="mt-4 w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={loading || !file || userCredits < CREDITS_PER_DENOISE}
          className={`
            mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300
            ${
              loading || !file || userCredits < CREDITS_PER_DENOISE
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-emerald-400 text-black hover:bg-emerald-300 active:scale-[0.98]"
            }
          `}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3 mono">
              <span className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              Processing audio...
            </span>
          ) : (
            "Enhance Audio"
          )}
        </button>

        {creditError && (
          <p className="mono text-xs text-red-400 mt-2">{creditError}</p>
        )}

        {outputUrl && (
          <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="mono text-xs text-emerald-400 tracking-widest uppercase">
                Enhanced Output
              </span>
            </div>

            <audio
              controls
              src={outputUrl}
              className="w-full rounded-lg"
              style={{ accentColor: "#34d399" }}
            />

            <a href={outputUrl} download="denoised.wav" className="block mt-4">
              <button className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:border-emerald-400 hover:text-emerald-400 transition-all duration-200 tracking-wider">
                Download denoised.wav
              </button>
            </a>
          </div>
        )}
        {renderHistoryPanel("mt-6 xl:hidden")}
      </div>

      {renderHistoryPanel(
        "hidden xl:block fixed right-4 top-8 w-[340px] h-[calc(100vh-4rem)] overflow-y-auto",
      )}

      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0f1017] p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold text-zinc-200 truncate">
                  {selectedHistoryItem.original_filename}
                </p>
                <p className="mono text-[11px] text-zinc-500 mt-1">
                  {formatTime(selectedHistoryItem.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistoryComparison}
                className="mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setSelectedTrack("original")}
                disabled={!selectedOriginalSrc}
                className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition-colors ${
                  selectedTrack === "original"
                    ? "bg-emerald-400 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                } ${!selectedOriginalSrc ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setSelectedTrack("denoised")}
                disabled={!selectedDenoisedSrc}
                className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition-colors ${
                  selectedTrack === "denoised"
                    ? "bg-emerald-400 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                } ${!selectedDenoisedSrc ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Denoised
              </button>
            </div>

            {activeAudioSrc ? (
              <audio
                controls
                src={activeAudioSrc}
                className="w-full rounded-lg"
                style={{ accentColor: "#34d399" }}
              />
            ) : (
              <p className="mono text-xs text-zinc-500">
                Audio preview is unavailable for this entry.
              </p>
            )}
          </div>
        </div>
      )}

      {historyDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0f1017] p-6">
            <h3 className="text-sm font-semibold text-zinc-200">
              Delete history entry?
            </h3>
            <p className="mono text-xs text-zinc-500 mt-2 leading-relaxed">
              This will remove this audio record and its stored media files.
            </p>
            <p className="text-xs text-zinc-300 mt-3 truncate">
              {historyDeleteTarget.original_filename}
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={historyDeleteLoading}
                className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-semibold tracking-wide uppercase hover:border-zinc-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteHistory}
                disabled={historyDeleteLoading}
                className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase ${
                  historyDeleteLoading
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-red-500 text-white hover:bg-red-400"
                }`}
              >
                {historyDeleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mono text-xs text-zinc-700 mt-12 tracking-widest">
        FYP Speech Denoizer · Prasanna Baral · 2025
      </p>
    </div>
  );
}
