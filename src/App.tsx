import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  LayoutGrid, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Search, 
  Upload, 
  Database, 
  Package, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

interface CloudLogiRow {
  [key: string]: any;
}

interface ProductMaster {
  id: string; // Internal state unique ID
  stockId: string; // 在庫ID (クラウドロジ照合用)
  handle: string;  // Shopify Handle
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  location: string;
}

interface ResultRow {
  stockId: string;
  productName: string;
  category: string;
  availableStock: number;
  handle?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  option3Name?: string;
  option3Value?: string;
  location?: string;
  status: 'matched' | 'not_found';
}

// --- Sample Data ---

const SAMPLE_MASTER_DATA: ProductMaster[] = [
  { id: '1', stockId: 'tanpopo_BOX', handle: 'tanpopo-tea', option1Name: 'Title', option1Value: 'Default Title', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: '中央区平尾2-9-8' },
  { id: '2', stockId: 'tanpopo-coffee_BOX', handle: 'tanpopo-coffee', option1Name: 'Title', option1Value: 'Default Title', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: '中央区平尾2-9-8' },
  { id: '3', stockId: 'green-rooibos', handle: 'green-rooibos', option1Name: 'Title', option1Value: 'Default Title', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: '中央区平尾2-9-8' },
];

const SAMPLE_CL_CSV = [
  ["在庫ID", "商品名", "カテゴリ", "販売可能在庫数"],
  ["tanpopo_BOX", "【BOX】たんぽぽ茶", "茶葉", "150"],
  ["tanpopo-coffee_BOX", "【BOX】たんぽぽ珈琲", "コーヒー", "85"],
  ["green-rooibos", "グリーンルイボスティー", "ハーブティー", "996"],
  ["unregistered_SKU", "未登録の商品", "ハーブティー", "12"]
];

// --- Helpers ---

const triggerDownload = (csvContent: string, filename: string) => {
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- ArrayBuffer to Text Decoder with Auto Encoding Detection (UTF-8 / Shift_JIS) ---
const decodeCsvFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        reject(new Error("ファイルの読み出しに失敗しました。"));
        return;
      }
      
      let utf8Text = "";
      let utf8Success = false;
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        utf8Text = utf8Decoder.decode(buffer);
        utf8Success = true;
      } catch (err) {
        utf8Success = false;
        try {
          // Non-fatal fallback for UTF-8 comparison
          utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        } catch (e) {
          utf8Text = "";
        }
      }
      
      let sjisText = "";
      try {
        const sjisDecoder = new TextDecoder('shift-jis', { fatal: false });
        sjisText = sjisDecoder.decode(buffer);
      } catch (err) {
        sjisText = utf8Text;
      }

      // Feature scoring based on typical Japanese CSV context
      const jpKeywords = ["在庫ID", "商品名", "カテゴリ", "販売可能在庫数", "在庫数", "実在庫", "品番", "商品コード", "型番", "SKU", "ロケーション", "倉庫"];
      
      let utf8Score = 0;
      let sjisScore = 0;

      // 1. Keyword appearance assessment
      jpKeywords.forEach(keyword => {
        if (utf8Text && utf8Text.includes(keyword)) utf8Score += 100;
        if (sjisText && sjisText.includes(keyword)) sjisScore += 100;
      });

      // 2. Identify decoding artifacts (Replacement characters)
      const utf8Replacements = utf8Text ? (utf8Text.match(/\uFFFD/g) || []).length : 0;
      const sjisReplacements = sjisText ? (sjisText.match(/\uFFFD/g) || []).length : 0;
      utf8Score -= utf8Replacements * 5;
      sjisScore -= sjisReplacements * 5;

      // 3. Native Japanese Hiragana letter distribution (extremely unlikely in corrupt decoding)
      const hiraganaRegex = /[ぁ-ん]/g;
      const utf8HiraganaCount = utf8Text ? (utf8Text.match(hiraganaRegex) || []).length : 0;
      const sjisHiraganaCount = sjisText ? (sjisText.match(hiraganaRegex) || []).length : 0;
      utf8Score += utf8HiraganaCount * 2;
      sjisScore += sjisHiraganaCount * 2;

      // 4. Boost pure native UTF-8 verification
      if (utf8Success && utf8Replacements === 0) {
        utf8Score += 500;
      }

      console.log(`CSV Encoding Decided. UTF-8 Score: ${utf8Score} (Rep: ${utf8Replacements}, Hira: ${utf8HiraganaCount}), Shift_JIS Score: ${sjisScore} (Rep: ${sjisReplacements}, Hira: ${sjisHiraganaCount})`);

      if (sjisScore > utf8Score) {
        resolve(sjisText);
      } else {
        resolve(utf8Text);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

// --- Custom Components ---

interface FileUploadZoneProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
}

function FileUploadZone({ label, file, onFileSelect }: FileUploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.toLowerCase().endsWith('.csv')) {
        onFileSelect(droppedFile);
      } else {
        alert("CSVファイルのみ対応しています。");
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2",
        isDragActive 
          ? "border-indigo-500 bg-indigo-50" 
          : file 
            ? "border-emerald-500 bg-emerald-50/35 hover:bg-emerald-50/50" 
            : "border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-slate-100"
      )}
      onClick={() => document.getElementById(`file-input-${label}`)?.click()}
    >
      <input
        id={`file-input-${label}`}
        type="file"
        accept=".csv"
        onChange={handleChange}
        className="hidden"
      />
      
      {file ? (
        <>
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-1">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-slate-800 truncate max-w-full block px-2">
            {file.name}
          </span>
          <span className="text-[10px] text-slate-400">
            {(file.size / 1024).toFixed(1)} KB • クリックかドロップで再選択
          </span>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-1 transition-colors">
            <Upload className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-slate-700 block">
            {label}をインポート
          </span>
          <span className="text-[10px] text-slate-400 leading-tight">
            ドラッグ＆ドロップ、または<br />クリックでファイルを選択
          </span>
        </>
      )}
    </div>
  );
}

export default function App() {
  // Tabs
  const [activeTab, setActiveTab] = useState<'sync' | 'master'>('sync');

  // Master State
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<ProductMaster, 'id'>>({
    stockId: '', handle: '', option1Name: '', option1Value: '', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: ''
  });
  const [newForm, setNewForm] = useState<Omit<ProductMaster, 'id'>>({
    stockId: '', handle: '', option1Name: 'Title', option1Value: 'Default Title', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: '中央区平尾2-9-8'
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');

  // Sync State
  const [cloudLogiFile, setCloudLogiFile] = useState<File | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUnmatched, setFilterUnmatched] = useState(false);

  // Load / Initialize Master from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('shopify_stock_sync_masters');
    if (saved) {
      try {
        setMasters(JSON.parse(saved));
      } catch (e) {
        setMasters(SAMPLE_MASTER_DATA);
      }
    } else {
      setMasters(SAMPLE_MASTER_DATA);
    }
  }, []);

  // Save to LocalStorage whenever masters change
  const saveMasters = (newMasters: ProductMaster[]) => {
    setMasters(newMasters);
    localStorage.setItem('shopify_stock_sync_masters', JSON.stringify(newMasters));
  };

  // --- Master Management Actions ---

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.stockId.trim() || !newForm.handle.trim()) {
      setError("在庫IDとHandleは必須項目です。");
      return;
    }
    const newlyCreated: ProductMaster = {
      id: Date.now().toString(),
      ...newForm
    };
    const updated = [...masters, newlyCreated];
    saveMasters(updated);
    setIsAddingNew(false);
    setNewForm({
      stockId: '', handle: '', option1Name: 'Title', option1Value: 'Default Title', option2Name: '', option2Value: '', option3Name: '', option3Value: '', location: '中央区平尾2-9-8'
    });
    setError(null);
  };

  const startEdit = (item: ProductMaster) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleUpdate = (id: string) => {
    if (!editForm.stockId.trim() || !editForm.handle.trim()) {
      setError("在庫IDとHandleは必須項目です。");
      return;
    }
    const updated = masters.map(m => m.id === id ? { ...m, ...editForm } : m);
    saveMasters(updated);
    setEditingId(null);
    setError(null);
  };

  const handleDelete = (id: string) => {
    if (confirm("このマスタデータを削除しますか？")) {
      const updated = masters.filter(m => m.id !== id);
      saveMasters(updated);
    }
  };

  // CSV Master Import
  const handleMasterCsvImport = async (file: File) => {
    try {
      const text = await decodeCsvFile(file);
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = res.data as any[];
          const findValue = (row: any, keys: string[]) => {
            if (!row) return null;
            const cleanedKeys = keys.map(k => k.trim().toLowerCase());
            const foundKey = Object.keys(row).find(k => {
              const ck = k.replace(/^\uFEFF/, '').trim().toLowerCase();
              return cleanedKeys.some(target => ck === target);
            });
            if (foundKey) return row[foundKey];
            const partialKey = Object.keys(row).find(k => {
              const ck = k.replace(/^\uFEFF/, '').trim().toLowerCase();
              return cleanedKeys.some(target => ck.includes(target) || target.includes(ck));
            });
            return partialKey ? row[partialKey] : null;
          };

          const imported: ProductMaster[] = rows.map((row, idx) => {
            return {
              id: (Date.now() + idx).toString(),
              stockId: String(findValue(row, ["在庫ID", "SKU", "商品コード", "品番"]) || "").trim(),
              handle: String(findValue(row, ["Handle", "ハンドル", "URL"]) || "").trim(),
              option1Name: String(findValue(row, ["Option1 Name", "オプション1名"]) || ""),
              option1Value: String(findValue(row, ["Option1 Value", "オプション1値"]) || ""),
              option2Name: String(findValue(row, ["Option2 Name", "オプション2名"]) || ""),
              option2Value: String(findValue(row, ["Option2 Value", "オプション2値"]) || ""),
              option3Name: String(findValue(row, ["Option3 Name", "オプション3名"]) || ""),
              option3Value: String(findValue(row, ["Option3 Value", "オプション3値"]) || ""),
              location: String(findValue(row, ["Location", "ロケーション", "倉庫"]) || "中央区平尾2-9-8"),
            };
          }).filter(item => item.stockId && item.handle);

          if (imported.length === 0) {
            setError("取り込み可能なデータが見つかりませんでした。在庫ID、Handleカラムが含まれているかご確認ください。");
            return;
          }

          const merged = [...masters];
          imported.forEach(imp => {
            const existingIdx = merged.findIndex(m => m.stockId === imp.stockId);
            if (existingIdx > -1) {
              merged[existingIdx] = imp; // Overwrite
            } else {
              merged.push(imp);
            }
          });

          saveMasters(merged);
          alert(`${imported.length}件のマスタデータをインポート/更新しました。`);
          setError(null);
        },
        error: (err) => {
          setError(`マスタ解析エラー: ${err.message}`);
        }
      });
    } catch (e: any) {
      setError(`マスタデコード処理中にエラーが発生しました: ${e.message}`);
    }
  };

  // Master CSV Export (Full database download)
  const exportAllMasterCsv = () => {
    const csvOutput = masters.map(m => ({
      "在庫ID": m.stockId,
      "Handle": m.handle,
      "Option1 Name": m.option1Name,
      "Option1 Value": m.option1Value,
      "Option2 Name": m.option2Name,
      "Option2 Value": m.option2Value,
      "Option3 Name": m.option3Name,
      "Option3 Value": m.option3Value,
      "Location": m.location
    }));
    const csvString = Papa.unparse(csvOutput);
    triggerDownload(csvString, `product_master_export_${new Date().toISOString().slice(0,10)}.csv`);
  };

  // Download Cloudlogi template sample
  const downloadCloudlogiSample = () => {
    const csvString = Papa.unparse(SAMPLE_CL_CSV);
    triggerDownload(csvString, "sample_cloudlogi_stock.csv");
  };

  // --- Sync Processing Actions ---

  const handleCloudLogiUpload = (file: File) => {
    setCloudLogiFile(file);
    // Instant auto-processing with the current masters
    processCloudLogi(file, masters);
  };

  const triggerManualProcess = () => {
    if (!cloudLogiFile) {
      setError("クラウドロジ在庫CSVをインポートしてください。");
      return;
    }
    processCloudLogi(cloudLogiFile, masters);
  };

  const processCloudLogi = async (clFile: File, currentMasters: ProductMaster[]) => {
    setIsProcessing(true);
    setError(null);

    try {
      const text = await decodeCsvFile(clFile);
      const parsedCL = await new Promise<CloudLogiRow[]>((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => resolve(res.data as CloudLogiRow[]),
          error: (err) => reject(err)
        });
      });

      const matchedResults: ResultRow[] = parsedCL.map(clRow => {
        const findValue = (row: any, keys: string[]) => {
          if (!row) return null;
          const cleanedKeys = keys.map(k => k.trim().toLowerCase());
          const foundKey = Object.keys(row).find(k => {
            const ck = k.replace(/^\uFEFF/, '').trim().toLowerCase();
            return cleanedKeys.some(target => ck === target);
          });
          if (foundKey) return row[foundKey];
          const partialKey = Object.keys(row).find(k => {
            const ck = k.replace(/^\uFEFF/, '').trim().toLowerCase();
            return cleanedKeys.some(target => ck.includes(target) || target.includes(ck));
          });
          return partialKey ? row[partialKey] : null;
        };

        const stockId = findValue(clRow, ["在庫ID", "商品コード", "SKU", "品番", "Item Code"]);
        const productName = findValue(clRow, ["商品名", "Title", "Name"]) || "---";
        const category = findValue(clRow, ["カテゴリ", "Category"]) || "---";
        const stockText = findValue(clRow, ["販売可能在庫数", "在庫数", "実在庫", "合計", "Stock", "Quantity", "Qty"]);
        const availableStock = stockText ? parseInt(stockText, 10) : 0;

        // Lookup from our editable state
        const masterMatch = currentMasters.find(m => String(m.stockId).trim() === String(stockId || "").trim());

        if (masterMatch) {
          return {
            stockId: String(stockId || "Unknown"),
            productName: String(productName),
            category: String(category),
            availableStock: isNaN(availableStock) ? 0 : availableStock,
            handle: masterMatch.handle,
            option1Name: masterMatch.option1Name,
            option1Value: masterMatch.option1Value,
            option2Name: masterMatch.option2Name,
            option2Value: masterMatch.option2Value,
            option3Name: masterMatch.option3Name,
            option3Value: masterMatch.option3Value,
            location: masterMatch.location,
            status: 'matched'
          };
        } else {
          return {
            stockId: String(stockId || "Unknown"),
            productName: String(productName),
            category: String(category),
            availableStock: isNaN(availableStock) ? 0 : availableStock,
            status: 'not_found'
          };
        }
      });

      setResults(matchedResults);
    } catch (e: any) {
      setError("クラウドロジ在庫CSVのインポート処理中にエラーが発生しました: " + (e.message || "不明なエラー"));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadShopifyCsv = () => {
    if (results.length === 0) return;
    const matched = results.filter(r => r.status === 'matched');
    
    if (matched.length === 0) {
      setError("商品マスタと照合できた商品が見つかりません。エクスポートできません。");
      return;
    }

    const csvOutput = matched.map(r => ({
      "Handle": r.handle,
      "Option1 Name": r.option1Name,
      "Option1 Value": r.option1Value,
      "Option2 Name": r.option2Name,
      "Option2 Value": r.option2Value,
      "Option3 Name": r.option3Name,
      "Option3 Value": r.option3Value,
      "Location": r.location,
      "On hand (new)": r.availableStock
    }));

    const csvStr = Papa.unparse(csvOutput);
    triggerDownload(csvStr, `shopify_stock_update_${new Date().toISOString().slice(0,10)}.csv`);
  };

  // Filter master display items
  const filteredMasters = masters.filter(m => 
    m.stockId.toLowerCase().includes(masterSearch.toLowerCase()) || 
    m.handle.toLowerCase().includes(masterSearch.toLowerCase()) ||
    m.location.toLowerCase().includes(masterSearch.toLowerCase())
  );

  const displayedResults = filterUnmatched ? results.filter(r => r.status === 'not_found') : results;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-100 flex-shrink-0 animate-pulse">S</div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800 flex items-center gap-2">
              在庫同期マネージャー <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md font-mono">v3.1.0</span>
            </h1>
            <p className="text-[10px] text-slate-400">クラウドロジ [販売可能在庫] ⇄ Shopify [On hand (new)]</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('sync')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all",
              activeTab === 'sync'
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            在庫データの照合
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all",
              activeTab === 'master'
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Database className="h-3.5 w-3.5" />
            商品マスタ管理
            <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {masters.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex gap-1.5 text-[9px] font-bold uppercase tracking-wider">
            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
              マスタ常時編集可能
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* TAB 1: SYNC PROCESS */}
        <AnimatePresence mode="wait">
          {activeTab === 'sync' && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex-1 flex overflow-hidden"
              key="tab-sync"
            >
              {/* Left Side: Drag & Drop control Panel */}
              <aside className="w-80 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
                <div>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">1. クラウドロジ インポート</h2>
                  <div className="space-y-3">
                    <div className="relative group">
                      <FileUploadZone 
                        label="クラウドロジ 在庫CSV" 
                        file={cloudLogiFile}
                        onFileSelect={handleCloudLogiUpload}
                      />
                      <button 
                        onClick={downloadCloudlogiSample}
                        className="absolute right-2 top-2 px-2 py-1 text-[9px] bg-white/95 hover:bg-white text-slate-500 hover:text-indigo-600 rounded border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity font-bold"
                      >
                        サンプル
                      </button>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[9px] text-slate-500 leading-normal">
                      <span className="font-bold block text-slate-600 mb-0.5">想定カラム(自動認識):</span>
                      在庫ID / 商品コード / SKU, 販売可能在庫数 / 在庫数
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">2. 状態状況</h2>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">マスタ登録件数:</span>
                      <span className="font-bold font-mono">{masters.length} 件</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">選択中ファイル:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[120px]" title={cloudLogiFile?.name || "未選択"}>
                        {cloudLogiFile ? cloudLogiFile.name : "未選択"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">3. 表示フィルター</h2>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input 
                        type="checkbox"
                        checked={filterUnmatched}
                        onChange={(e) => setFilterUnmatched(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-xs text-slate-600 group-hover:text-slate-900 transition-colors font-medium">マスタ未登録のみ抽出</span>
                    </label>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100">
                  <button
                    onClick={triggerManualProcess}
                    disabled={!cloudLogiFile || isProcessing}
                    className={cn(
                      "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-sm",
                      !cloudLogiFile 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-[0.98]"
                    )}
                  >
                    {isProcessing ? (
                      <RefreshCw className="animate-spin h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    照合再実行
                  </button>
                </div>
              </aside>

              {/* Right Side: Sync Table Results Preview & Action area */}
              <main className="flex-1 overflow-hidden flex flex-col p-8 gap-6 bg-slate-50">
                <div className="flex items-end justify-between shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">在庫照合プレビュー</h3>
                    <p className="text-sm text-slate-500">
                      {results.length > 0 
                        ? `クラウドロジ取得分 ${results.length} 件 ⇄ 各種マスタ照合。一致: ${results.filter(r => r.status === 'matched').length} 件 / 不一致(未登録): ${results.filter(r => r.status === 'not_found').length} 件`
                        : "クラウドロジの在庫CSVを左パネルからアップロードするか、マスタを変更して照合させてください。"}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setResults([]);
                        setCloudLogiFile(null);
                        setError(null);
                      }}
                      disabled={results.length === 0}
                      className="px-4 py-2 bg-white border border-slate-200 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-slate-600 disabled:opacity-50"
                    >
                      クリア
                    </button>
                    <button 
                      onClick={downloadShopifyCsv}
                      disabled={results.length === 0 || results.filter(r => r.status === 'matched').length === 0}
                      className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Shopify用CSVを出力
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 shrink-0"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-xs font-semibold">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main Results Table */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#fafafa] border-b border-slate-200 sticky top-0 z-10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-3.5">在庫ID</th>
                          <th className="px-6 py-3.5">クラウドロジ商品名</th>
                          <th className="px-6 py-3.5">カテゴリ</th>
                          <th className="px-6 py-3.5">販売可能在庫数</th>
                          <th className="px-6 py-3.5">Shopify Handle</th>
                          <th className="px-6 py-3.5">ロケーション</th>
                          <th className="px-6 py-3.5">照合ステータス</th>
                          <th className="px-6 py-3.5 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {displayedResults.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-6 py-20 text-center text-slate-400 italic">
                              {results.length > 0 ? "該当条件に一致する照合結果はありません" : "クラウドロジの在庫データがインされた際にここにリアルタイム表示されます"}
                            </td>
                          </tr>
                        ) : (
                          displayedResults.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono font-bold text-slate-700">{row.stockId}</td>
                              <td className="px-6 py-4 font-medium text-slate-900 max-w-xs truncate" title={row.productName}>{row.productName}</td>
                              <td className="px-6 py-4 text-slate-400">{row.category}</td>
                              <td className="px-6 py-4 font-bold text-indigo-600">{row.availableStock}</td>
                              <td className="px-6 py-4 text-slate-600 font-medium font-mono">{row.handle || '---'}</td>
                              <td className="px-6 py-4 text-slate-500 max-w-[120px] truncate" title={row.location}>{row.location || '---'}</td>
                              <td className="px-6 py-4">
                                {row.status === 'matched' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    同期準備完了
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    マスタ未登録
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {row.status === 'not_found' ? (
                                  <button
                                    onClick={() => {
                                      setNewForm({
                                        stockId: row.stockId,
                                        handle: row.stockId.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
                                        location: '中央区平尾2-9-8',
                                        option1Name: 'Title',
                                        option1Value: 'Default Title',
                                        option2Name: '',
                                        option2Value: '',
                                        option3Name: '',
                                        option3Value: '',
                                      });
                                      setIsAddingNew(true);
                                      setActiveTab('master');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded text-[10px] transition-colors shadow-sm"
                                    title="マスタにこの商品を新規追加します"
                                  >
                                    <Plus className="h-3 w-3" />
                                    マスタに追加
                                  </button>
                                ) : (
                                  <span className="text-emerald-500 text-[10px] font-bold inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    照合OK
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {results.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase shrink-0">
                      <span>Total synced preview: {results.length} items</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-600">Matched(同期可): {results.filter(r => r.status === 'matched').length}</span>
                        <span className="text-amber-600">Unmatched(未登録): {results.filter(r => r.status === 'not_found').length}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Prompt Shopify push if matches found */}
                {results.length > 0 && results.some(r => r.status === 'matched') && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-20 bg-indigo-900 rounded-xl flex items-center px-6 text-white relative overflow-hidden shrink-0 shadow-lg"
                  >
                    <div className="z-10">
                      <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest mb-0.5">Shopify 更新用データ</p>
                      <h4 className="text-sm font-bold">
                        {results.filter(r => r.status === 'matched').length}件の照合完了データを [On hand (new)] として一元出力します。
                      </h4>
                    </div>
                    <div className="ml-auto z-10">
                      <button 
                        onClick={downloadShopifyCsv}
                        className="px-5 py-2.5 bg-white text-indigo-950 text-xs font-bold rounded-lg hover:bg-slate-100 transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                      >
                        <Download className="h-4 w-4" />
                        在庫更新CSVを保存
                      </button>
                    </div>
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-800 rounded-full opacity-40"></div>
                  </motion.div>
                )}
              </main>
            </motion.div>
          )}

          {/* TAB 2: MASTER MANAGEMENT */}
          {activeTab === 'master' && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex-1 flex overflow-hidden bg-slate-50"
              key="tab-master"
            >
              <main className="flex-1 overflow-hidden flex flex-col p-8 gap-6">
                
                {/* Master Controller Bar */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  
                  {/* Search */}
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="在庫ID、Handle、倉庫で検索..."
                      value={masterSearch}
                      onChange={(e) => setMasterSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                    />
                  </div>

                  {/* Trigger File input for fast mass master imports */}
                  <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    
                    {/* Bulk Master CSV Import */}
                    <label className="px-3.5 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 border border-slate-200">
                      <Upload className="h-3.5 w-3.5 text-slate-500" />
                      マスタCSV取り込み
                      <input 
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) handleMasterCsvImport(files[0]);
                        }}
                      />
                    </label>

                    {/* Full export of masters to PC */}
                    <button 
                      onClick={exportAllMasterCsv}
                      disabled={masters.length === 0}
                      className="px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      マスタを全件出力
                    </button>

                    {/* Open Create form drawer */}
                    <button 
                      onClick={() => setIsAddingNew(!isAddingNew)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      {isAddingNew ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      商品を新規追加
                    </button>

                  </div>
                </div>

                {isAddingNew && (
                  <motion.form 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleCreate}
                    className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 shrink-0"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-950 uppercase">在庫ID(必須)</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="例: tanpopo_BOX"
                        value={newForm.stockId}
                        onChange={(e) => setNewForm({ ...newForm, stockId: e.target.value })}
                        className="w-full p-2 bg-white border border-indigo-200 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-950 uppercase">Shopify Handle(必須)</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="例: tanpopo-tea"
                        value={newForm.handle}
                        onChange={(e) => setNewForm({ ...newForm, handle: e.target.value })}
                        className="w-full p-2 bg-white border border-indigo-200 rounded text-xs "
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-950 uppercase">Option1 Name / Value</label>
                      <div className="flex gap-1">
                        <input 
                          type="text" 
                          placeholder="Title"
                          value={newForm.option1Name}
                          onChange={(e) => setNewForm({ ...newForm, option1Name: e.target.value })}
                          className="w-1/2 p-2 bg-white border border-indigo-200 rounded text-xs"
                        />
                        <input 
                          type="text" 
                          placeholder="Default Title"
                          value={newForm.option1Value}
                          onChange={(e) => setNewForm({ ...newForm, option1Value: e.target.value })}
                          className="w-1/2 p-2 bg-white border border-indigo-200 rounded text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-950 uppercase">Location / 倉庫</label>
                      <input 
                        type="text" 
                        placeholder="例: 中央区平尾2-9-8"
                        value={newForm.location}
                        onChange={(e) => setNewForm({ ...newForm, location: e.target.value })}
                        className="w-full p-2 bg-white border border-indigo-200 rounded text-xs"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button 
                        type="submit"
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-colors"
                      >
                        保存する
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsAddingNew(false)}
                        className="p-2 bg-slate-200 hover:bg-slate-300 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.form>
                )}

                {/* Database Table Master */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-3.5">在庫ID (クラウドロジ共通番号)</th>
                          <th className="px-6 py-3.5">Shopify Handle</th>
                          <th className="px-6 py-3.5">商品オプション（Option 1）</th>
                          <th className="px-6 py-3.5">商品オプション（Option 2）</th>
                          <th className="px-6 py-3.5">商品オプション（Option 3）</th>
                          <th className="px-6 py-3.5">倉庫Location</th>
                          <th className="px-6 py-3.5 text-right">アクション</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100">
                        {filteredMasters.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                              登録済みのマスタ、または検索に一致するデータが存在しません。いつでも手動で追加・修正、またはCSVを流し込めます。
                            </td>
                          </tr>
                        ) : (
                          filteredMasters.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                              {editingId === row.id ? (
                                // Read-Write Mode (Editing)
                                <>
                                  <td className="px-4 py-2 font-medium">
                                    <input 
                                      type="text" 
                                      value={editForm.stockId} 
                                      onChange={(e) => setEditForm({...editForm, stockId: e.target.value})}
                                      className="p-1.5 w-full bg-slate-50 border border-slate-200 rounded font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input 
                                      type="text" 
                                      value={editForm.handle} 
                                      onChange={(e) => setEditForm({...editForm, handle: e.target.value})}
                                      className="p-1.5 w-full bg-slate-50 border border-slate-200 rounded font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                      <input 
                                        type="text" 
                                        placeholder="Name" 
                                        value={editForm.option1Name} 
                                        onChange={(e) => setEditForm({...editForm, option1Name: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Value" 
                                        value={editForm.option1Value} 
                                        onChange={(e) => setEditForm({...editForm, option1Value: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                      <input 
                                        type="text" 
                                        placeholder="Name" 
                                        value={editForm.option2Name} 
                                        onChange={(e) => setEditForm({...editForm, option2Name: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Value" 
                                        value={editForm.option2Value} 
                                        onChange={(e) => setEditForm({...editForm, option2Value: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                      <input 
                                        type="text" 
                                        placeholder="Name" 
                                        value={editForm.option3Name} 
                                        onChange={(e) => setEditForm({...editForm, option3Name: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Value" 
                                        value={editForm.option3Value} 
                                        onChange={(e) => setEditForm({...editForm, option3Value: e.target.value})}
                                        className="p-1 w-1/2 bg-slate-50 border border-slate-200 rounded text-[11px]"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <input 
                                      type="text" 
                                      value={editForm.location} 
                                      onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                                      className="p-1.5 w-full bg-slate-50 border border-slate-200 rounded text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button 
                                        onClick={() => handleUpdate(row.id)}
                                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded transition-colors"
                                        title="マスタを保存"
                                      >
                                        <Save className="h-4 w-4" />
                                      </button>
                                      <button 
                                        onClick={() => setEditingId(null)}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded transition-colors"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                // Read-Only mode
                                <>
                                  <td className="px-6 py-4 font-mono font-bold text-slate-700 leading-none">
                                    {row.stockId}
                                  </td>
                                  <td className="px-6 py-4 font-mono font-medium text-slate-900 leading-none">
                                    {row.handle}
                                  </td>
                                  <td className="px-6 py-4">
                                    {row.option1Name ? (
                                      <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium text-[10px]">
                                        {row.option1Name}: {row.option1Value}
                                      </span>
                                    ) : <span className="text-slate-300">なし</span>}
                                  </td>
                                  <td className="px-6 py-4">
                                    {row.option2Name ? (
                                      <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium text-[10px]">
                                        {row.option2Name}: {row.option2Value}
                                      </span>
                                    ) : <span className="text-slate-300">なし</span>}
                                  </td>
                                  <td className="px-6 py-4">
                                    {row.option3Name ? (
                                      <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium text-[10px]">
                                        {row.option3Name}: {row.option3Value}
                                      </span>
                                    ) : <span className="text-slate-300">なし</span>}
                                  </td>
                                  <td className="px-6 py-4 text-slate-600">
                                    {row.location}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button 
                                        onClick={() => startEdit(row)}
                                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded transition-colors"
                                        title="商品マスタの修正"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => handleDelete(row.id)}
                                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-red-600 rounded transition-colors"
                                        title="商品マスタを削除"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {masters.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase shrink-0">
                      <span>保存済みマスタ総件数: {masters.length} 件</span>
                      <span>ブラウザに常時ローカル保存されます</span>
                    </div>
                  )}
                </div>
              </main>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
