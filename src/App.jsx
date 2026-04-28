import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import emailjs from "@emailjs/browser";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Fish,
  Gauge,
  Info,
  Mail,
  MapPin,
  MessageSquareText,
  Search,
  UploadCloud,
  Waves,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const REPORT_EMAIL = "annekealyas@gmail.com";
const EMAILJS_SERVICE_ID = "service_t4vyyca";
const EMAILJS_TEMPLATE_ID = "template_68lvur9";
const EMAILJS_PUBLIC_KEY = "PKSaWnb2_qHYpQ_YZ";

const stopwords = new Set([
  "yang", "dan", "di", "ke", "dari", "itu", "ini", "aja", "aku", "saya", "nya", "kok", "ya", "ga", "gak", "nggak",
  "ikan", "sapu", "sama", "buat", "kalau", "kalo", "ada", "bang", "kak", "lu", "lo", "gw", "gue", "sih", "dong",
  "deh", "nih", "mah", "lah", "pun", "juga", "jadi", "bisa", "mau", "lebih", "karena", "sudah", "udah", "tidak",
  "ngga", "kan", "dah", "yg", "dengan", "dalam", "untuk", "pada", "atau", "akan", "terus", "the", "and", "a", "to", "of",
]);

const fishKeywords = [
  "sapu", "sapu sapu", "sapu-sapu", "sapu2", "pleco", "janitor", "janitor fish", "pterygoplichthys", "loricariidae",
  "ikan pembersih", "ikan bandaraya", "ikan sapu",
];

const positiveWords = ["bagus", "setuju", "dukung", "solusi", "manfaat", "apresiasi", "keren", "baik", "mantap", "bersih", "edukasi", "olah", "pupuk", "pakan", "program", "semoga", "teratasi", "bermanfaat", "inovasi", "sepakat"];
const negativeWords = ["rusak", "cemar", "tercemar", "limbah", "bahaya", "takut", "jijik", "kotor", "ancam", "hama", "parah", "mati", "ngeri", "serem", "lokal", "telur", "invasif", "ekosistem", "merusak", "punah", "beracun", "logam", "berat"];
const neutralWords = ["apa", "kenapa", "gimana", "bagaimana", "boleh", "dimakan", "makan", "harga", "jenis", "hias", "kok", "berapa", "darimana", "mana", "kapan", "siapa"];

function normalizeHeader(key) {
  return String(key || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function cleanText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/@\w+|#\w+/g, " ")
    .replace(/sapu\s*-\s*sapu|sapu2|sapu²/g, "sapu sapu")
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return cleanText(text).split(" ").filter((word) => word.length > 2 && !stopwords.has(word));
}

function countMatches(text, words) {
  const clean = cleanText(text);
  return words.filter((word) => clean.includes(word)).length;
}

function autoLabelSentiment(text = "") {
  const pos = countMatches(text, positiveWords);
  const neg = countMatches(text, negativeWords);
  const neu = countMatches(text, neutralWords);
  if (neg > pos && neg >= neu) return "Negatif";
  if (pos > neg && pos >= neu) return "Positif";
  return "Netral";
}

function normalizeSentiment(value, text = "") {
  const v = String(value || "").toLowerCase();
  if (v.includes("positif") || v.includes("positive") || v.includes("apresiatif") || v.includes("solutif") || v.includes("dukung") || v.includes("bagus")) return "Positif";
  if (v.includes("negatif") || v.includes("negative") || v.includes("khawatir") || v.includes("takut") || v.includes("jijik") || v.includes("kritik") || v.includes("marah")) return "Negatif";
  if (v.includes("netral") || v.includes("neutral") || v.includes("bertanya") || v.includes("heran") || v.includes("sarkas") || v.includes("humor")) return "Netral";
  return autoLabelSentiment(text);
}

function detectCommentColumn(columns) {
  const candidates = ["komentar", "comment", "comments", "text", "caption", "isi_komentar", "tweet", "content", "ulasan", "full_text"];
  return candidates.find((c) => columns.includes(c)) || columns.find((c) => c.includes("komentar") || c.includes("comment") || c.includes("text"));
}

function detectSentimentColumn(columns) {
  const candidates = ["sentimen", "sentiment", "label", "kategori", "kategori_awal", "class", "kelas", "polarity"];
  return candidates.find((c) => columns.includes(c)) || columns.find((c) => c.includes("sentimen") || c.includes("kategori") || c.includes("label"));
}

function detectDateColumn(columns) {
  const candidates = ["tanggal", "date", "created_at", "time", "waktu", "published", "published_at"];
  return candidates.find((c) => columns.includes(c)) || columns.find((c) => c.includes("tanggal") || c.includes("date") || c.includes("time"));
}

function validateFishTopic(rows, commentCol) {
  const filled = rows.filter((row) => String(row[commentCol] || "").trim());
  const hitCount = filled.filter((row) => countMatches(row[commentCol], fishKeywords) > 0).length;
  const ratio = filled.length ? hitCount / filled.length : 0;
  return { hitCount, ratio, valid: hitCount >= 3 || ratio >= 0.15 };
}

function buildWordFreq(rows, commentCol, filterSentiment = null) {
  const count = new Map();
  rows
    .filter((row) => !filterSentiment || row.__sentimen === filterSentiment)
    .forEach((row) => tokenize(row[commentCol]).forEach((word) => count.set(word, (count.get(word) || 0) + 1)));

  return Array.from(count.entries())
    .map(([word, freq]) => ({ word, freq }))
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 20);
}

function buildSentimentData(rows) {
  const counts = { Netral: 0, Negatif: 0, Positif: 0 };
  rows.forEach((row) => {
    counts[row.__sentimen || "Netral"] += 1;
  });
  return [
    { name: "Netral", value: counts.Netral || 0, color: "#14b8a6" },
    { name: "Negatif", value: counts.Negatif || 0, color: "#f97316" },
    { name: "Positif", value: counts.Positif || 0, color: "#22c55e" },
  ];
}

function buildTrendFromDate(rows, dateCol) {
  if (!dateCol) return [];
  const map = new Map();
  rows.forEach((row) => {
    const raw = row[dateCol];
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bulan, jumlah]) => ({ bulan, jumlah }));
}

function seededShuffle(array) {
  const arr = [...array];
  let seed = 42;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildMLDataset(rows, commentCol) {
  const labeled = rows
    .map((row) => ({ text: String(row[commentCol] || ""), label: row.__sentimen || "Netral" }))
    .filter((row) => row.text.trim());

  const wordCount = new Map();
  labeled.forEach((row) => tokenize(row.text).forEach((word) => wordCount.set(word, (wordCount.get(word) || 0) + 1)));

  const vocab = Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 400)
    .map(([word]) => word);

  const vocabIndex = new Map(vocab.map((word, index) => [word, index]));

  const vectorize = (text, binary = false) => {
    const vec = Array(vocab.length).fill(0);
    tokenize(text).forEach((word) => {
      const idx = vocabIndex.get(word);
      if (idx !== undefined) vec[idx] = binary ? 1 : vec[idx] + 1;
    });
    return vec;
  };

  return { data: labeled.map((row) => ({ ...row, x: vectorize(row.text), xb: vectorize(row.text, true) })), vocab };
}

function splitTrainTest(data) {
  const groups = { Positif: [], Negatif: [], Netral: [] };
  data.forEach((row) => groups[row.label]?.push(row));
  const train = [];
  const test = [];
  Object.values(groups).forEach((items) => {
    const shuffled = seededShuffle(items);
    const nTest = Math.max(1, Math.round(shuffled.length * 0.2));
    test.push(...shuffled.slice(0, nTest));
    train.push(...shuffled.slice(nTest));
  });
  return { train, test };
}

function evaluatePairs(pairs) {
  const labels = ["Positif", "Negatif", "Netral"];
  const total = pairs.length || 1;
  const correct = pairs.filter((pair) => pair.actual === pair.pred).length;
  let weightedPrecision = 0;
  let weightedRecall = 0;
  let weightedF1 = 0;

  const confusion = labels.map((actual) => ({
    actual,
    ...Object.fromEntries(labels.map((pred) => [pred, pairs.filter((pair) => pair.actual === actual && pair.pred === pred).length])),
  }));

  labels.forEach((label) => {
    const tp = pairs.filter((pair) => pair.actual === label && pair.pred === label).length;
    const fp = pairs.filter((pair) => pair.actual !== label && pair.pred === label).length;
    const fn = pairs.filter((pair) => pair.actual === label && pair.pred !== label).length;
    const support = pairs.filter((pair) => pair.actual === label).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const weight = support / total;
    weightedPrecision += precision * weight;
    weightedRecall += recall * weight;
    weightedF1 += f1 * weight;
  });

  return {
    accuracy: Number(((correct / total) * 100).toFixed(2)),
    precision: Number((weightedPrecision * 100).toFixed(2)),
    recall: Number((weightedRecall * 100).toFixed(2)),
    f1: Number((weightedF1 * 100).toFixed(2)),
    confusion,
  };
}

function trainNaiveBayes(train, vocabSize) {
  const labels = ["Positif", "Negatif", "Netral"];
  const classDocs = {};
  const wordTotals = {};
  const wordCounts = {};
  labels.forEach((label) => {
    classDocs[label] = 0;
    wordTotals[label] = 0;
    wordCounts[label] = Array(vocabSize).fill(1);
  });

  train.forEach((row) => {
    classDocs[row.label] += 1;
    row.x.forEach((value, index) => {
      wordCounts[row.label][index] += value;
      wordTotals[row.label] += value;
    });
  });

  return (row) => labels
    .map((label) => {
      const prior = Math.log((classDocs[label] + 1) / (train.length + labels.length));
      const denom = wordTotals[label] + vocabSize;
      const likelihood = row.x.reduce((sum, value, index) => (!value ? sum : sum + value * Math.log(wordCounts[label][index] / denom)), 0);
      return { label, score: prior + likelihood };
    })
    .sort((a, b) => b.score - a.score)[0].label;
}

function trainLinearSVM(train, vocabSize) {
  const labels = ["Positif", "Negatif", "Netral"];
  const weights = Object.fromEntries(labels.map((label) => [label, Array(vocabSize).fill(0)]));
  const bias = Object.fromEntries(labels.map((label) => [label, 0]));
  const lr = 0.045;
  const lambda = 0.001;

  for (let epoch = 0; epoch < 35; epoch++) {
    seededShuffle(train).forEach((row) => {
      labels.forEach((label) => {
        const y = row.label === label ? 1 : -1;
        let score = bias[label];
        row.xb.forEach((value, index) => {
          if (value) score += weights[label][index] * value;
        });
        if (y * score < 1) {
          row.xb.forEach((value, index) => {
            if (value) weights[label][index] += lr * (y * value - lambda * weights[label][index]);
          });
          bias[label] += lr * y;
        }
      });
    });
  }

  return (row) => labels
    .map((label) => {
      let score = bias[label];
      row.xb.forEach((value, index) => {
        if (value) score += weights[label][index] * value;
      });
      return { label, score };
    })
    .sort((a, b) => b.score - a.score)[0].label;
}

function trainLogisticRegression(train, vocabSize) {
  const labels = ["Positif", "Negatif", "Netral"];
  const weights = Object.fromEntries(labels.map((label) => [label, Array(vocabSize).fill(0)]));
  const bias = Object.fromEntries(labels.map((label) => [label, 0]));
  const lr = 0.04;

  const softmax = (scores) => {
    const max = Math.max(...scores);
    const exps = scores.map((score) => Math.exp(score - max));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((value) => value / sum);
  };

  for (let epoch = 0; epoch < 45; epoch++) {
    seededShuffle(train).forEach((row) => {
      const scores = labels.map((label) => {
        let score = bias[label];
        row.xb.forEach((value, index) => {
          if (value) score += weights[label][index] * value;
        });
        return score;
      });
      const probs = softmax(scores);
      labels.forEach((label, labelIndex) => {
        const y = row.label === label ? 1 : 0;
        const error = y - probs[labelIndex];
        row.xb.forEach((value, index) => {
          if (value) weights[label][index] += lr * error * value;
        });
        bias[label] += lr * error;
      });
    });
  }

  return (row) => labels
    .map((label) => {
      let score = bias[label];
      row.xb.forEach((value, index) => {
        if (value) score += weights[label][index] * value;
      });
      return { label, score };
    })
    .sort((a, b) => b.score - a.score)[0].label;
}

function trainAndCompareModels(rows, commentCol, labelSource) {
  const { data, vocab } = buildMLDataset(rows, commentCol);
  const uniqueLabels = new Set(data.map((row) => row.label));

  if (data.length < 12 || uniqueLabels.size < 2 || vocab.length < 3) {
    return { data: [], source: "waiting", note: "Data terlalu sedikit atau kelas sentimen kurang beragam, sehingga model belum dapat dilatih ulang.", confusion: [] };
  }

  const { train, test } = splitTrainTest(data);
  const models = [
    { model: "Naive Bayes", predictor: trainNaiveBayes(train, vocab.length) },
    { model: "SVM", predictor: trainLinearSVM(train, vocab.length) },
    { model: "LogReg", predictor: trainLogisticRegression(train, vocab.length) },
  ];

  const results = models.map(({ model, predictor }) => {
    const pairs = test.map((row) => ({ actual: row.label, pred: predictor(row) }));
    return { model, ...evaluatePairs(pairs), source: labelSource };
  });

  const best = results.reduce((a, b) => (b.f1 > a.f1 ? b : a), results[0]);

  return {
    data: results,
    source: labelSource,
    confusion: best.confusion,
    note: labelSource === "manual_label"
      ? `Model dilatih langsung di website memakai ${train.length} data latih dan ${test.length} data uji dari label file upload.`
      : `Model dilatih langsung di website memakai ${train.length} data latih dan ${test.length} data uji. Karena file hanya berisi scraping komentar, label awal dibuat otomatis berbasis kata kunci, sehingga hasil bersifat eksploratif/weak-label.`,
  };
}

function buildRecommendations({ sentimentData, wordData, negativeWordsData, totalRows, modelData, modelSource }) {
  const total = Math.max(totalRows, 1);
  const negative = sentimentData.find((item) => item.name === "Negatif")?.value || 0;
  const neutral = sentimentData.find((item) => item.name === "Netral")?.value || 0;
  const positive = sentimentData.find((item) => item.name === "Positif")?.value || 0;
  const topWords = wordData.slice(0, 8).map((item) => item.word);
  const bestModel = modelData.length ? modelData.reduce((a, b) => (Number(b.f1 || 0) > Number(a.f1 || 0) ? b : a), modelData[0]) : null;
  const recs = [];

  if (negative / total >= 0.35) recs.push({ tone: "red", title: "Negatif Mayoritas: Respons Ahli Perlu Cepat", desc: `Sentimen negatif tinggi (${negative} komentar). Kata negatif dominan: ${negativeWordsData.slice(0, 6).map((w) => w.word).join(", ") || "belum cukup data"}. Perlu klarifikasi tentang pencemaran, ikan lokal, dan keamanan konsumsi.` });
  if (neutral / total >= 0.45) recs.push({ tone: "amber", title: "Netral Dominan: Edukasi Dasar Diperlukan", desc: `Sentimen netral dominan (${neutral} komentar). Publik masih banyak bertanya/penasaran, sehingga konten edukasi spesies invasif perlu dibuat sederhana dan visual.` });
  if (positive / total >= 0.2) recs.push({ tone: "green", title: "Respons Positif Bisa Jadi Aksi", desc: `Sentimen positif (${positive} komentar) dapat diarahkan menjadi pelaporan lokasi, pembersihan sungai, dan kampanye literasi lingkungan.` });

  const environmentWords = ["sungai", "limbah", "cemar", "kotor", "rusak", "ekosistem", "air", "lokal"];
  const consumptionWords = ["makan", "dimakan", "konsumsi", "aman", "beracun", "logam"];
  if (topWords.some((word) => environmentWords.includes(word))) recs.push({ tone: "cyan", title: "Verifikasi Kualitas Air", desc: `Top kata mengarah ke isu lingkungan (${topWords.join(", ")}). Rekomendasi: hubungkan laporan lokasi dengan uji kualitas air.` });
  if (topWords.some((word) => consumptionWords.includes(word))) recs.push({ tone: "purple", title: "Edukasi Keamanan Konsumsi", desc: "Topik konsumsi muncul. Perlu edukasi bahwa keamanan konsumsi tergantung asal perairan dan potensi cemaran/logam berat." });
  if (bestModel) recs.push({ tone: modelSource === "weak_label" ? "slate" : "teal", title: `Model Terbaik: ${bestModel.model}`, desc: `${bestModel.model} memiliki F1-score tertinggi (${bestModel.f1}%). ${modelSource === "weak_label" ? "Karena label dibuat otomatis, hasil ini eksploratif dan perlu validasi manual." : "Model memakai label dari file upload."}` });

  return recs.slice(0, 6);
}

function EmptyState() {
  return (
    <div className="mt-7 rounded-[2rem] border-2 border-dashed border-slate-200 bg-white/70 p-10 text-center shadow-sm">
      <Fish className="mx-auto text-teal-600" size={58} />
      <h2 className="mt-4 text-3xl font-black text-slate-950">Belum ada analisis.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Upload file scraping tentang ikan sapu-sapu terlebih dahulu. Dashboard, sentimen, model, kata dominan, rekomendasi, dan peta laporan akan muncul setelah file valid dianalisis.
      </p>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, note }) {
  return (
    <motion.div whileHover={{ y: -6 }} className="rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-500">{title}</p>
          <h3 className="mt-2 text-4xl font-black text-slate-950">{value}</h3>
          <p className="mt-2 text-sm leading-5 text-slate-500">{note}</p>
        </div>
        <div className="rounded-2xl bg-teal-50 p-3 text-teal-700"><Icon size={25} /></div>
      </div>
    </motion.div>
  );
}

function SectionHeader({ eyebrow, title, desc }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{desc}</p>
    </div>
  );
}

function GlassCard({ children, className = "" }) {
  return <div className={`rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/70 backdrop-blur ${className}`}>{children}</div>;
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("Belum ada file");
  const [commentCol, setCommentCol] = useState("");
  const [sentimentCol, setSentimentCol] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [modelData, setModelData] = useState([]);
  const [modelSource, setModelSource] = useState("waiting");
  const [modelNote, setModelNote] = useState("");
  const [confusion, setConfusion] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [report, setReport] = useState({ lokasi: "", jumlah: "sedikit", catatan: "", nama: "" });
  const [reports, setReports] = useState([]);

  const hasAnalysis = rows.length > 0;
  const sentimentData = useMemo(() => buildSentimentData(rows), [rows]);
  const wordData = useMemo(() => buildWordFreq(rows, commentCol), [rows, commentCol]);
  const negativeWordsData = useMemo(() => buildWordFreq(rows, commentCol, "Negatif"), [rows, commentCol]);
  const totalRows = rows.length;
  const dominantSentiment = hasAnalysis ? sentimentData.reduce((a, b) => (b.value > a.value ? b : a), sentimentData[0]) : null;
  const bestModel = modelData.length ? modelData.reduce((a, b) => (Number(b.f1 || 0) > Number(a.f1 || 0) ? b : a), modelData[0]) : null;
  const recommendations = useMemo(() => buildRecommendations({ sentimentData, wordData, negativeWordsData, totalRows, modelData, modelSource }), [sentimentData, wordData, negativeWordsData, totalRows, modelData, modelSource]);

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploadWarning("");
    setUploadSuccess("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      if (!workbook.SheetNames?.length) throw new Error("Workbook tidak memiliki sheet. Pastikan file Excel tidak rusak.");

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const normalized = rawJson.map((row) => {
        const out = {};
        Object.entries(row).forEach(([key, value]) => { out[normalizeHeader(key)] = value; });
        return out;
      });

      const columns = Object.keys(normalized[0] || {});
      const detectedComment = detectCommentColumn(columns);
      const detectedSentiment = detectSentimentColumn(columns);
      const detectedDate = detectDateColumn(columns);
      const ext = file.name.split(".").pop().toLowerCase();

      if (!["xlsx", "xls", "csv"].includes(ext)) throw new Error("Format file tidak sesuai. File harus .xlsx, .xls, atau .csv.");
      if (!normalized.length) throw new Error("File kosong. Sheet pertama tidak memiliki data.");
      if (!detectedComment) throw new Error("Kolom komentar tidak ditemukan. Gunakan kolom komentar/comment/text/tweet/content.");

      const topic = validateFishTopic(normalized, detectedComment);
      if (!topic.valid) {
        setRows([]);
        setModelData([]);
        setTrendData([]);
        setConfusion([]);
        throw new Error(`File ditolak karena tidak terdeteksi sebagai data ikan sapu-sapu. Minimal harus ada beberapa komentar yang memuat kata seperti sapu-sapu, pleco, janitor fish, atau pterygoplichthys. Terdeteksi: ${topic.hitCount} komentar relevan.`);
      }

      const processed = normalized
        .filter((row) => String(row[detectedComment] || "").trim())
        .map((row) => ({
          ...row,
          __sentimen: detectedSentiment ? normalizeSentiment(row[detectedSentiment], row[detectedComment]) : autoLabelSentiment(row[detectedComment]),
          __label_source: detectedSentiment ? "manual_label" : "weak_label",
        }));

      const trained = trainAndCompareModels(processed, detectedComment, detectedSentiment ? "manual_label" : "weak_label");
      setRows(processed);
      setFileName(file.name);
      setCommentCol(detectedComment);
      setSentimentCol(detectedSentiment || "otomatis_dari_komentar");
      setDateCol(detectedDate || "tidak_ada_kolom_tanggal");
      setModelData(trained.data);
      setModelSource(trained.source);
      setModelNote(trained.note);
      setConfusion(trained.confusion || []);
      setTrendData(buildTrendFromDate(processed, detectedDate));

      if (!detectedSentiment) {
        setUploadWarning("File scraping tidak memiliki label sentimen. Website membuat label awal otomatis berbasis kata kunci, lalu melatih model secara eksploratif/weak-label.");
      }
      setUploadSuccess(`File valid tentang ikan sapu-sapu. ${processed.length} komentar berhasil dianalisis. Relevansi topik: ${topic.hitCount} komentar memuat kata kunci ikan sapu-sapu.`);
    } catch (error) {
      setUploadError(error.message || "File gagal dibaca.");
      event.target.value = "";
    }
  }

  async function submitReport(event) {
    event.preventDefault();

    if (!report.lokasi.trim()) {
      alert("Lokasi sungai/waduk wajib diisi.");
      return;
    }

    const kategori = report.jumlah === "banyak" ? "Populasi tinggi" : report.jumlah === "sedang" ? "Perlu verifikasi" : "Populasi rendah";
    const newReport = { ...report, kategori, waktu: new Date().toLocaleString("id-ID") };

    const templateParams = {
      to_email: REPORT_EMAIL,
      nama: report.nama || "-",
      reply_to: REPORT_EMAIL,
      lokasi: report.lokasi,
      jumlah: report.jumlah,
      kategori,
      catatan: report.catatan || "-",
      waktu: newReport.waktu,
    };

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, { publicKey: EMAILJS_PUBLIC_KEY });
      setReports((prev) => [newReport, ...prev]);
      alert("Laporan berhasil terkirim otomatis ke email SAPUSIGNAL!");
      setReport({ lokasi: "", jumlah: "sedikit", catatan: "", nama: "" });
    } catch (error) {
      console.error("EmailJS error:", error);
      alert("Laporan gagal terkirim. Cek Service ID, Template ID, Public Key, dan template EmailJS.");
    }
  }

  const mapQuery = report.lokasi || reports[0]?.lokasi || "Jakarta Indonesia";

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-slate-50 to-emerald-50 text-slate-900">
      <main className="mx-auto max-w-7xl p-4 md:p-8">
        <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-300 md:p-10">
          <div className="absolute -right-12 -top-16 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
          <div className="relative z-10 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {["Validasi Ikan Sapu-Sapu", "Upload Excel", "Auto Analysis", "Train ML", "Report Map"].map((item) => (
                  <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-teal-100 ring-1 ring-white/10">{item}</span>
                ))}
              </div>
              <h1 className="max-w-5xl text-4xl font-black leading-tight tracking-tight md:text-6xl">SAPUSIGNAL: Upload Data, Website Langsung Membaca Sinyal Ekologis.</h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">Website hanya menerima data scraping tentang ikan sapu-sapu. Sebelum upload, dashboard kosong. Setelah file valid, sentimen, kata dominan, model terbaik, rekomendasi, dan peta laporan muncul berdasarkan data upload.</p>
            </div>
            <div className="grid place-items-center">
              <div className="relative h-72 w-72 rounded-[3rem] bg-gradient-to-br from-teal-200 via-cyan-200 to-emerald-200 p-5 shadow-2xl shadow-teal-950/30">
                <div className="grid h-full w-full place-items-center rounded-[2.5rem] bg-slate-950 text-teal-300"><Fish size={126} /></div>
                <div className="absolute -bottom-4 left-5 rounded-3xl bg-white p-4 text-slate-950 shadow-2xl">
                  <p className="text-xs font-black uppercase text-slate-500">Status</p>
                  <p className="text-2xl font-black">{hasAnalysis ? "Aktif" : "Kosong"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <GlassCard>
            <SectionHeader eyebrow="Upload Center" title="Upload File Scraping Ikan Sapu-Sapu" desc="File wajib memuat komentar tentang ikan sapu-sapu. Format cukup kolom komentar saja; sentimen akan dianalisis otomatis oleh website." />
            <label className="group flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-8 text-center transition hover:border-teal-500 hover:bg-teal-50">
              <UploadCloud className="text-teal-700" size={52} />
              <p className="mt-4 text-xl font-black text-slate-950">Klik untuk upload Excel/CSV</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Kolom yang diterima: komentar/comment/text/tweet/content. Data selain ikan sapu-sapu akan ditolak.</p>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            </label>
            {uploadError && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mr-2 inline" size={18} />{uploadError}</div>}
            {uploadWarning && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900"><Info className="mr-2 inline" size={18} />{uploadWarning}</div>}
            {uploadSuccess && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="mr-2 inline" size={18} />{uploadSuccess}</div>}
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p><b>File aktif:</b> {fileName}</p><p><b>Kolom komentar:</b> {commentCol || "-"}</p><p><b>Sumber label:</b> {sentimentCol || "-"}</p><p><b>Kolom tanggal:</b> {dateCol || "-"}</p></div>
          </GlassCard>

          {hasAnalysis ? (
            <div className="grid gap-4 md:grid-cols-2">
              <StatCard icon={FileSpreadsheet} title="Data Terbaca" value={totalRows} note="Jumlah komentar valid dari file upload." />
              <StatCard icon={MessageSquareText} title="Sentimen Dominan" value={dominantSentiment?.name || "-"} note={`${dominantSentiment?.value || 0} komentar masuk kategori ini.`} />
              <StatCard icon={Search} title="Kata Dominan" value={wordData[0]?.word || "-"} note={`${wordData[0]?.freq || 0} kali muncul.`} />
              <StatCard icon={Zap} title="Model Terbaik" value={bestModel?.model || "-"} note={`${modelSource === "weak_label" ? "Weak-label" : "Manual label"}. F1-score ${bestModel?.f1 || 0}%.`} />
            </div>
          ) : <EmptyState />}
        </section>

        {hasAnalysis && (
          <>
            <section className="mt-7 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <GlassCard>
                <SectionHeader eyebrow="Sentiment Lens" title="Grafik Sentimen dari Data Upload" desc="Hasil ini dihitung dari komentar yang kamu upload." />
                <div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={112} paddingAngle={5}>{sentimentData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                <div className="grid gap-2">{sentimentData.map((item) => <div key={item.name} className="flex justify-between rounded-2xl bg-slate-50 p-3 text-sm"><span className="font-black">{item.name}</span><span>{item.value} komentar</span></div>)}</div>
              </GlassCard>
              <GlassCard>
                <SectionHeader eyebrow="Kata Dominan" title="Frekuensi Kata Komentar" desc="Jika negatif mayoritas, kata dominan negatif ditampilkan terpisah di bawah." />
                <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={wordData.slice(0, 12)} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" /><YAxis dataKey="word" type="category" width={90} /><Tooltip /><Bar dataKey="freq" fill="#0f766e" radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></div>
              </GlassCard>
            </section>

            {dominantSentiment?.name === "Negatif" && (
              <section className="mt-7"><GlassCard><SectionHeader eyebrow="Negative Keyword Focus" title="Kata yang Mendorong Sentimen Negatif" desc="Bagian ini muncul otomatis ketika sentimen negatif menjadi mayoritas." /><div className="grid gap-3 md:grid-cols-4">{negativeWordsData.slice(0, 8).map((word) => <div key={word.word} className="rounded-2xl bg-red-50 p-4 text-red-900"><p className="text-2xl font-black">{word.word}</p><p className="text-sm font-bold">{word.freq} kali muncul</p></div>)}</div></GlassCard></section>
            )}

            {trendData.length > 0 && <section className="mt-7"><GlassCard><SectionHeader eyebrow="Temporal Trend" title="Tren Komentar Berdasarkan Tanggal File" desc="Bagian ini hanya muncul jika file memiliki kolom tanggal/date/time." /><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="bulan" /><YAxis /><Tooltip /><Area type="monotone" dataKey="jumlah" name="Jumlah Komentar" stroke="#0f766e" fill="#ccfbf1" strokeWidth={3} /></AreaChart></ResponsiveContainer></div></GlassCard></section>}

            <section className="mt-7 grid gap-6 xl:grid-cols-3">
              <GlassCard><SectionHeader eyebrow="Model Battle" title="Perbandingan Model Otomatis" desc={modelNote} /><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={modelData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="model" /><YAxis /><Tooltip /><Bar dataKey="accuracy" name="Accuracy" fill="#0f766e" radius={[12,12,0,0]} /><Bar dataKey="f1" name="F1-score" fill="#38bdf8" radius={[12,12,0,0]} /></BarChart></ResponsiveContainer></div></GlassCard>
              <GlassCard><SectionHeader eyebrow="Confusion Matrix" title={`Evaluasi ${bestModel?.model || "Model"}`} desc="Matrix model terbaik dari data upload." /><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{["Aktual\\Pred", "Positif", "Negatif", "Netral"].map((header) => <th key={header} className="bg-slate-100 p-3 text-left font-black">{header}</th>)}</tr></thead><tbody>{confusion.map((row) => <tr key={row.actual}>{[row.actual, row.Positif, row.Negatif, row.Netral].map((value, index) => <td key={index} className="border-b border-slate-100 p-3 font-bold">{value}</td>)}</tr>)}</tbody></table></div></GlassCard>
              <GlassCard><SectionHeader eyebrow="EADI Meter" title="Environmental Awareness Delay Index" desc="Contoh indikator jeda kesadaran ekologis." /><div className="rounded-[2rem] bg-slate-950 p-7 text-white"><div className="flex items-center gap-3"><Gauge className="text-teal-300" size={34}/><div><p className="text-sm text-slate-300">EADI</p><h3 className="text-6xl font-black text-teal-300">3</h3></div></div><p className="mt-2 text-lg font-bold">bulan keterlambatan</p><div className="mt-5 rounded-2xl bg-amber-300 p-3 text-center font-black text-amber-950">Kesadaran Sedang Terlambat</div></div></GlassCard>
            </section>

            <section className="mt-7"><GlassCard><SectionHeader eyebrow="Action Room" title="Rekomendasi Otomatis Berdasarkan Data" desc="Rekomendasi berubah mengikuti sentimen, kata dominan, dan model terbaik." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recommendations.map((rec, index) => { const toneClass = { amber: "bg-amber-50 text-amber-900", red: "bg-red-50 text-red-900", green: "bg-emerald-50 text-emerald-900", cyan: "bg-cyan-50 text-cyan-900", purple: "bg-violet-50 text-violet-900", teal: "bg-teal-50 text-teal-900", slate: "bg-slate-100 text-slate-800" }[rec.tone] || "bg-slate-100 text-slate-800"; const Icon = rec.tone === "red" ? AlertTriangle : rec.tone === "green" ? CheckCircle2 : rec.tone === "cyan" ? Waves : Info; return <div key={index} className={`rounded-[1.5rem] p-5 ${toneClass}`}><Icon size={28}/><h3 className="mt-3 font-black">{rec.title}</h3><p className="mt-2 text-sm leading-6">{rec.desc}</p></div>; })}</div></GlassCard></section>
          </>
        )}

        <section className="mt-7 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <GlassCard>
            <SectionHeader eyebrow="Eco Report Map" title="Form Pelaporan Lokasi Ikan Sapu-Sapu" desc="Isi lokasi sungai/waduk, kategori jumlah, dan catatan. Laporan akan terkirim otomatis ke email pelaporan." />
            <form onSubmit={submitReport} className="grid gap-3">
              <input className="rounded-2xl border border-teal-100 bg-white px-4 py-3 text-sm" placeholder="Nama pelapor opsional" value={report.nama} onChange={(event) => setReport({ ...report, nama: event.target.value })} />
              <input className="rounded-2xl border border-teal-100 bg-white px-4 py-3 text-sm" placeholder="Lokasi sungai/waduk, contoh: Sungai Ciliwung, Jakarta" value={report.lokasi} onChange={(event) => setReport({ ...report, lokasi: event.target.value })} required />
              <select className="rounded-2xl border border-teal-100 bg-white px-4 py-3 text-sm" value={report.jumlah} onChange={(event) => setReport({ ...report, jumlah: event.target.value })}>
                <option value="sedikit">Sedikit</option>
                <option value="sedang">Sedang</option>
                <option value="banyak">Banyak</option>
              </select>
              <textarea className="min-h-28 rounded-2xl border border-teal-100 bg-white px-4 py-3 text-sm" placeholder="Catatan: kondisi air, perkiraan jumlah, foto menyusul, dsb." value={report.catatan} onChange={(event) => setReport({ ...report, catatan: event.target.value })} />
              <button className="rounded-2xl bg-teal-600 px-5 py-3 text-sm font-black text-white hover:bg-teal-700"><Mail className="mr-2 inline" size={18}/>Kirim Laporan Otomatis ke {REPORT_EMAIL}</button>
            </form>
          </GlassCard>
          <GlassCard>
            <SectionHeader eyebrow="Map Preview" title="Deteksi Lokasi Peta" desc="Peta mengikuti lokasi yang diketik atau laporan terakhir." />
            <div className="overflow-hidden rounded-[2rem] border border-slate-200"><iframe title="SAPUSIGNAL Map" className="h-80 w-full" src="https://www.openstreetmap.org/export/embed.html?bbox=94.0,-11.0,141.0,6.5&layer=mapnik&marker=0,0"></iframe></div>
            {reports.length > 0 && <div className="mt-4 grid gap-2">{reports.slice(0, 4).map((item, index) => <div key={index} className="rounded-2xl bg-slate-50 p-3 text-sm"><b>{item.lokasi}</b> — {item.kategori} ({item.jumlah})</div>)}</div>}
            <a className="mt-4 inline-block rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noreferrer"><MapPin className="mr-2 inline" size={17}/>Buka Lokasi di OpenStreetMap</a>
          </GlassCard>
        </section>
      </main>
    </div>
  );
}
