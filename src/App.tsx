import React, { useState } from 'react';
import { FileSpreadsheet, Download, CheckCircle2, AlertCircle, RefreshCw, Layers, LayoutGrid, Info, Filter } from 'lucide-react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

interface CloudLogiRow {
  [key: string]: any;
}

interface ProductMasterRow {
  [key: string]: any;
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

// --- Components ---

const FileUploadZone = ({ 
  label, 
  onFileSelect, 
  file, 
  accept = ".csv" 
}: { 
  label: string; 
  onFileSelect: (file: File) => void; 
  file: File | null;
  accept?: string;
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  return (
    <motion.div 
      layout
      className={cn(
        "relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all duration-200",
        isDragging ? "border-indigo-400 bg-indigo-50/50 shadow-inner" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50",
        file ? "border-emerald-200 bg-emerald-50/30" : "bg-slate-50/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        className="absolute inset-0 opacity-0 cursor-pointer" 
        accept={accept}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            onFileSelect(files[0]);
          }
        }}
      />
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-slate-600 truncate mr-2">{label}</p>
          {file && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
        </div>
        <p className={cn(
          "text-[10px] truncate",
          file ? "text-emerald-700 font-medium" : "text-slate-400"
        )}>
          {file ? file.name : "ファイルをドラッグ＆ドロップ"}
        </p>
      </div>
    </motion.div>
  );
};

// --- Constants & Helpers ---

const DOWNLOAD_SAMPLES = {
  cloudlogi: [
    ["在庫ID", "商品名", "カテゴリ", "販売可能在庫数"],
    ["tanpopo_BOX", "【BOX】たんぽぽ茶", "茶葉", "150"],
    ["tanpopo-coffee_BOX", "【BOX】たんぽぽ珈琲", "コーヒー", "85"],
    ["green-rooibos", "グリーンルイボスティー", "ハーブティー", "996"],
    ["not-on-master-sku", "未登録のサンプル商品", "ハーブティー", "12"]
  ],
  master: [
    ["在庫ID", "Handle", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Location"],
    ["tanpopo_BOX", "tanpopo-tea", "Title", "Default Title", "", "", "", "", "中央区平尾2-9-8"],
    ["tanpopo-coffee_BOX", "tanpopo-coffee", "Title", "Default Title", "", "", "", "", "中央区平尾2-9-8"],
    ["green-rooibos", "green-rooibos", "Title", "Default Title", "", "", "", "", "中央区平尾2-9-8"]
  ]
};

const triggerDownload = (data: any[][], filename: string) => {
  const csvStr = Papa.unparse(data);
  const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function App() {
  const [cloudLogiFile, setCloudLogiFile] = useState<File | null>(null);
  const [productMasterFile, setProductMasterFile] = useState<File | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUnmatched, setFilterUnmatched] = useState<boolean>(false);

  const handleDownloadSample = (type: keyof typeof DOWNLOAD_SAMPLES) => {
    triggerDownload(DOWNLOAD_SAMPLES[type], `sample_${type}.csv`);
  };

  const exportMatchedMaster = () => {
    const matched = results.filter(r => r.status === 'matched');
    const exportData = [
      ["在庫ID", "Handle", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Location"],
      ...matched.map(r => [
        r.stockId, 
        r.handle || "",
        r.option1Name || "",
        r.option1Value || "",
        r.option2Name || "",
        r.option2Value || "",
        r.option3Name || "",
        r.option3Value || "",
        r.location || ""
      ])
    ];
    triggerDownload(exportData, `matched_master_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const processFiles = async () => {
    if (!cloudLogiFile || !productMasterFile) {
      setError("クラウドロジ在庫CSVと商品マスタCSVの両方をアップロードしてください。");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const [cloudLogiData, productMasterData] = await Promise.all([
        new Promise<CloudLogiRow[]>((resolve, reject) => {
          Papa.parse(cloudLogiFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as CloudLogiRow[]),
            error: (err) => reject(err),
          });
        }),
        new Promise<ProductMasterRow[]>((resolve, reject) => {
          Papa.parse(productMasterFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as ProductMasterRow[]),
            error: (err) => reject(err),
          });
        })
      ]);

      const processedResults: ResultRow[] = cloudLogiData.map(clRow => {
        const findValue = (row: any, keys: string[]) => {
          if (!row) return null;
          const foundKey = Object.keys(row).find(k => keys.some(target => k.trim().toLowerCase() === target.trim().toLowerCase()));
          if (foundKey) return row[foundKey];
          // Fallback simple fuzzy match if strict match is not found
          const partialKey = Object.keys(row).find(k => keys.some(target => k.trim().toLowerCase().includes(target.trim().toLowerCase())));
          return partialKey ? row[partialKey] : null;
        };

        const stockId = findValue(clRow, ["在庫ID", "商品コード", "SKU", "品番", "Item Code"]);
        const productName = findValue(clRow, ["商品名", "Title", "Name"]) || "---";
        const category = findValue(clRow, ["カテゴリ", "Category"]) || "---";
        const stockText = findValue(clRow, ["販売可能在庫数", "在庫数", "実在庫", "合計", "Stock", "Quantity", "Qty", "On hand"]);
        const availableStock = stockText ? parseInt(stockText, 10) : 0;

        const masterMatch = productMasterData.find(mRow => {
          const mStockId = findValue(mRow, ["在庫ID", "SKU", "商品コード", "品番", "Item Code"]);
          return mStockId && String(mStockId).trim() === String(stockId || "").trim();
        });

        if (masterMatch) {
          return {
            stockId: String(stockId || "Unknown"),
            productName: String(productName),
            category: String(category),
            availableStock: isNaN(availableStock) ? 0 : availableStock,
            handle: String(findValue(masterMatch, ["Handle", "ハンドル", "URL", "Slug"]) || ""),
            option1Name: String(findValue(masterMatch, ["Option1 Name", "オプション1名"]) || ""),
            option1Value: String(findValue(masterMatch, ["Option1 Value", "オプション1値"]) || ""),
            option2Name: String(findValue(masterMatch, ["Option2 Name", "オプション2名"]) || ""),
            option2Value: String(findValue(masterMatch, ["Option2 Value", "オプション2値"]) || ""),
            option3Name: String(findValue(masterMatch, ["Option3 Name", "オプション3名"]) || ""),
            option3Value: String(findValue(masterMatch, ["Option3 Value", "オプション3値"]) || ""),
            location: String(findValue(masterMatch, ["Location", "ロケーション", "倉庫"]) || ""),
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

      setResults(processedResults);
    } catch (err: any) {
      setError("CSVデータの解析中にエラーが発生しました: " + (err.message || "不明なエラー"));
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
    const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `shopify_stock_update_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResults = filterUnmatched ? results.filter(r => r.status === 'not_found') : results;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0 z-20 shadow-sm col-span-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-100 flex-shrink-0">S</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            在庫同期マネージャー 
            <span className="text-sm font-normal text-slate-400 ml-2">v3.0.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className={cn(
              "px-2 py-1 rounded transition-colors",
              cloudLogiFile ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"
            )}>
              {cloudLogiFile ? "CloudLogi CSV Loaded" : "CloudLogi Wait"}
            </span>
            <span className={cn(
              "px-2 py-1 rounded transition-colors",
              productMasterFile ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-slate-100 text-slate-400 border border-slate-200"
            )}>
              {productMasterFile ? "Product Master Loaded" : "Master Wait"}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-200" />
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">1. クラウドロジ インポート</h2>
            </div>
            <div className="space-y-3">
              <div className="relative group">
                <FileUploadZone 
                  label="クラウドロジ 在庫CSV" 
                  file={cloudLogiFile}
                  onFileSelect={setCloudLogiFile}
                />
                <button 
                  onClick={() => handleDownloadSample('cloudlogi')}
                  className="absolute right-2 top-2 px-2 py-1 text-[10px] bg-white/90 hover:bg-white text-slate-500 hover:text-indigo-600 rounded border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                >
                  サンプルCSV
                </button>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[10px] text-slate-500 leading-normal">
                <span className="font-bold block text-slate-600 mb-0.5">※必須項目</span>
                在庫ID, 商品名, カテゴリ, 販売可能在庫数
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">2. 商品マスタ インポート</h2>
            </div>
            <div className="space-y-3">
              <div className="relative group">
                <FileUploadZone 
                  label="商品マスタ CSV" 
                  file={productMasterFile}
                  onFileSelect={setProductMasterFile}
                />
                <button 
                  onClick={() => handleDownloadSample('master')}
                  className="absolute right-2 top-2 px-2 py-1 text-[10px] bg-white/90 hover:bg-white text-slate-500 hover:text-indigo-600 rounded border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                >
                  サンプルCSV
                </button>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[10px] text-slate-500 leading-normal">
                <span className="font-bold block text-slate-600 mb-0.5">※必須項目</span>
                在庫ID, Handle, Option1 Name, Option1 Value, Location など
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">3. 照合オプション</h2>
            <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={filterUnmatched}
                  onChange={(e) => setFilterUnmatched(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-600 group-hover:text-slate-900 transition-colors font-medium">マスタ未検出のみ表示</span>
              </label>
            </div>
          </section>

          <section className="mt-auto pt-4 border-t border-slate-100">
            <button
              onClick={processFiles}
              disabled={!cloudLogiFile || !productMasterFile || isProcessing}
              className={cn(
                "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-sm",
                (!cloudLogiFile || !productMasterFile) 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-[0.98]"
              )}
            >
              {isProcessing ? (
                <RefreshCw className="animate-spin h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              照合プロセス実行
            </button>
          </section>
        </aside>

        {/* Main Panel */}
        <main className="flex-1 overflow-hidden flex flex-col p-8 gap-6 bg-slate-50">
          <div className="flex items-end justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-slate-800">照合プレビュー</h3>
              <p className="text-sm text-slate-500">
                {results.length > 0 
                  ? `合計 ${results.length} 件を取り込み。対応マスタ検出：${results.filter(r => r.status === 'matched').length} 件 / 未検出：${results.filter(r => r.status === 'not_found').length} 件`
                  : "CSVファイルをインポートして照合をしてください。"}
              </p>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setResults([]);
                  setCloudLogiFile(null);
                  setProductMasterFile(null);
                  setError(null);
                }}
                className="px-4 py-2 bg-white border border-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-slate-600"
              >
                クリア
              </button>
              <button 
                onClick={exportMatchedMaster}
                disabled={results.length === 0}
                className="px-4 py-2 bg-white border border-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                マスタ出力
              </button>
              <button 
                onClick={downloadShopifyCsv}
                disabled={results.length === 0 || results.filter(r => r.status === 'matched').length === 0}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                更新用CSVエクスポート
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
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#fafafa] border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">在庫ID</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">商品名</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">カテゴリ</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ロジ在庫 (販売可能)</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shopify Handle</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ロケーション</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ステータス</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                        {results.length > 0 ? "条件に一致するデータがありません" : "表示するデータがありません（CSVを処理してください）"}
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((row, idx) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(idx * 0.005, 0.3) }}
                        key={idx} 
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-700">{row.stockId}</td>
                        <td className="px-6 py-4 font-medium text-slate-900 max-w-xs truncate">{row.productName}</td>
                        <td className="px-6 py-4 text-xs text-slate-400">{row.category}</td>
                        <td className="px-6 py-4 font-bold text-indigo-600">{row.availableStock}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{row.handle || '---'}</td>
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-[120px] truncate">{row.location || '---'}</td>
                        <td className="px-6 py-4">
                          {row.status === 'matched' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                              同期対象
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              マスタ未登録
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {results.length > 0 && (
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider shrink-0">
                <span>合計: {results.length} 個のデータを処理完了</span>
                <div className="flex gap-4">
                  <span className="text-indigo-600">照合成功: {results.filter(r => r.status === 'matched').length}</span>
                  <span className="text-amber-600">未登録: {results.filter(r => r.status === 'not_found').length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer Button */}
          {results.length > 0 && results.some(r => r.status === 'matched') && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-24 bg-indigo-900 rounded-2xl flex items-center px-8 text-white relative overflow-hidden shrink-0 shadow-2xl shadow-indigo-950/20"
            >
              <div className="z-10">
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Shopify連携準備完了</p>
                <h4 className="text-lg font-bold">
                  {results.filter(r => r.status === 'matched').length}個の該当商品の在庫をShopify形式（On hand (new) 更新）で一括出力します。
                </h4>
              </div>
              <div className="ml-auto z-10">
                <button 
                  onClick={downloadShopifyCsv}
                  className="px-6 py-3 bg-white text-indigo-900 rounded-lg font-bold hover:bg-slate-100 transition-all hover:scale-105 active:scale-95 shadow-xl"
                >
                  Shopify更新CSVをダウンロード
                </button>
              </div>
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-800 rounded-full opacity-40"></div>
              <div className="absolute right-20 -bottom-20 w-32 h-32 bg-indigo-800 rounded-full opacity-20"></div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
