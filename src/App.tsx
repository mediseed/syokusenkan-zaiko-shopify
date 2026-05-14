import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertCircle, RefreshCw, Layers, LayoutGrid, Info } from 'lucide-react';
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
  sku: string;
  currentStock: number;
  handle?: string;
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
    ["商品コード", "在庫数"],
    ["tanpopo_BOX", "150"],
    ["tanpopo-coffee_BOX", "85"],
    ["green-rooibos", "1200"]
  ],
  master: [
    ["SKU", "Handle"],
    ["tanpopo_BOX", "tanpopo-tea-box"],
    ["tanpopo-coffee_BOX", "tanpopo-coffee-box"],
    ["green-rooibos", "organic-green-rooibos"]
  ],
  shopify: [
    ["Handle", "Title", "Option1 Name", "Option1 Value", "SKU", "Location", "On hand (current)", "On hand (new)"],
    ["tanpopo-tea-box", "たんぽぽ茶", "Title", "Default Title", "tanpopo_BOX", "Main Warehouse", "50", ""],
    ["tanpopo-coffee-box", "たんぽぽコーヒー", "Title", "Default Title", "tanpopo-coffee_BOX", "Main Warehouse", "20", ""]
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
  const [shopifyFile, setShopifyFile] = useState<File | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalShopifyData, setOriginalShopifyData] = useState<any[]>([]);

  const handleDownloadSample = (type: keyof typeof DOWNLOAD_SAMPLES) => {
    triggerDownload(DOWNLOAD_SAMPLES[type], `sample_${type}.csv`);
  };

  const exportMatchedMaster = () => {
    const matched = results.filter(r => r.status === 'matched');
    const exportData = [
      ["SKU", "Handle"],
      ...matched.map(r => [r.sku, r.handle || ""])
    ];
    triggerDownload(exportData, `matched_master_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const processFiles = async () => {
    if (!cloudLogiFile || !productMasterFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      const [cloudLogiData, productMasterData, rawShopifyData] = await Promise.all([
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
        }),
        shopifyFile ? new Promise<any[]>((resolve, reject) => {
          Papa.parse(shopifyFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err),
          });
        }) : Promise.resolve([])
      ]);

      setOriginalShopifyData(rawShopifyData);

      const processedResults: ResultRow[] = cloudLogiData.map(clRow => {
        const findValue = (row: any, keys: string[]) => {
          if (!row) return null;
          const foundKey = Object.keys(row).find(k => keys.some(target => k.toLowerCase().includes(target.toLowerCase())));
          return foundKey ? row[foundKey] : null;
        };

        const clSku = findValue(clRow, ["商品コード", "SKU", "品番", "Item Code"]);
        const clStockText = findValue(clRow, ["在庫数", "実在庫", "合計", "Stock", "Quantity", "Qty"]);
        const clStock = clStockText ? parseInt(clStockText, 10) : 0;

        const masterMatch = productMasterData.find(mRow => 
          findValue(mRow, ["SKU", "商品コード", "品番", "Item Code"]) === clSku
        );

        return {
          sku: String(clSku || "Unknown"),
          currentStock: isNaN(clStock) ? 0 : clStock,
          handle: findValue(masterMatch, ["Handle", "ハンドル", "URL", "Slug"]),
          status: masterMatch ? 'matched' : 'not_found'
        };
      });

      setResults(processedResults);
    } catch (err: any) {
      setError("ファイルの処理中にエラーが発生しました: " + (err.message || "不明なエラー"));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadShopifyCsv = () => {
    if (results.length === 0) return;
    
    let csvOutput: any[] = [];

    if (shopifyFile && originalShopifyData.length > 0) {
      // Use original Shopify structure and update 'On hand (new)'
      csvOutput = originalShopifyData.map(row => {
        const rowSku = row["SKU"];
        const match = results.find(r => r.sku === rowSku);
        
        return {
          ...row,
          "On hand (new)": match ? match.currentStock : row["On hand (new)"]
        };
      });
    } else {
      // Fallback
      const matched = results.filter(r => r.status === 'matched');
      csvOutput = matched.map(r => ({
        "Handle": r.handle,
        "SKU": r.sku,
        "Inventory Tracker": "shopify",
        "Quantity": r.currentStock
      }));
    }

    const csvStr = Papa.unparse(csvOutput);
    const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `shopify_inventory_update_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-100">S</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            在庫同期マネージャー 
            <span className="text-sm font-normal text-slate-400 ml-2">v2.4.1</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className={cn(
              "px-2 py-1 rounded transition-colors",
              cloudLogiFile ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"
            )}>
              {cloudLogiFile ? "CloudLogi Active" : "CloudLogi Wait"}
            </span>
            <span className={cn(
              "px-2 py-1 rounded transition-colors",
              shopifyFile ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-slate-100 text-slate-400 border border-slate-200"
            )}>
              {shopifyFile ? "Shopify Template" : "Shopify Wait"}
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
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">1. データソース (在庫元)</h2>
            </div>
            <div className="space-y-3">
              <div className="relative group">
                <FileUploadZone 
                  label="クラウドロジ CSV" 
                  file={cloudLogiFile}
                  onFileSelect={setCloudLogiFile}
                />
                <button 
                  onClick={() => handleDownloadSample('cloudlogi')}
                  className="absolute right-2 top-2 p-1 text-[10px] bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  サンプル
                </button>
              </div>

              <div className="relative group">
                <FileUploadZone 
                  label="商品マスタ CSV" 
                  file={productMasterFile}
                  onFileSelect={setProductMasterFile}
                />
                <button 
                  onClick={() => handleDownloadSample('master')}
                  className="absolute right-2 top-2 p-1 text-[10px] bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                   サンプル
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">2. 更新ターゲット</h2>
            </div>
            <div className="space-y-3">
              <div className="relative group">
                <FileUploadZone 
                  label="Shopify 在庫CSV" 
                  file={shopifyFile}
                  onFileSelect={setShopifyFile}
                />
                <button 
                  onClick={() => handleDownloadSample('shopify')}
                  className="absolute right-2 top-2 p-1 text-[10px] bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                   サンプル
                </button>
              </div>
              <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                  {'Shopifyの「商品管理 > 在庫 > エクスポート」から取得したCSVをここに設定すると、HSコード等の情報を保持したまま更新用CSVを作成できます。'}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-auto pt-4 border-t border-slate-100">
            <button
              onClick={processFiles}
              disabled={!cloudLogiFile || !productMasterFile || isProcessing}
              className={cn(
                "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200",
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
                  ? `合計 ${results.length} 件のアイテムを確認。照合不一致：${results.filter(r => r.status === 'not_found').length} 件`
                  : "CSVファイルをアップロードして照合を開始してください。"}
              </p>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setResults([])}
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
                disabled={results.length === 0}
                className="px-4 py-2 bg-white border border-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                変換データ出力
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
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
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">商品コード (SKU)</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ロジ在庫</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shopify ハンドル</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ステータス</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic">
                        表示するデータがありません
                      </td>
                    </tr>
                  ) : (
                    results.map((row, idx) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.01 }}
                        key={idx} 
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-700">{row.sku}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{row.currentStock}</td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{row.handle || '---'}</td>
                        <td className="px-6 py-4">
                          {row.status === 'matched' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                              同期準備完了
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              マスタ未検出
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
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Total: {results.length} items processed</span>
                <div className="flex gap-2">
                  <span className="text-indigo-600">Matched: {results.filter(r => r.status === 'matched').length}</span>
                  <span className="text-amber-600">Unmatched: {results.filter(r => r.status === 'not_found').length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer Button */}
          {results.length > 0 && results.some(r => r.status === 'matched') && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-24 bg-indigo-900 rounded-2xl flex items-center px-8 text-white relative overflow-hidden shrink-0 shadow-2xl shadow-indigo-200/50"
            >
              <div className="z-10">
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Shopify連携準備完了</p>
                <h4 className="text-lg font-bold">
                  {results.filter(r => r.status === 'matched').length}個のアイテムをShopifyへプッシュしますか？
                </h4>
              </div>
              <div className="ml-auto z-10">
                <button 
                  onClick={downloadShopifyCsv}
                  className="px-6 py-3 bg-white text-indigo-900 rounded-lg font-bold hover:bg-slate-100 transition-transform active:scale-95 shadow-xl"
                >
                  Shopify在庫を一括更新
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
