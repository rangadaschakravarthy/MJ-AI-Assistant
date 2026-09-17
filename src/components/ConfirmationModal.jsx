import React from 'react';
import { AlertTriangle, ShieldAlert, Check, X, FileCode, FileText } from 'lucide-react';

export default function ConfirmationModal({ confirmationRequest, onConfirm, onCancel, onChoice }) {
  if (!confirmationRequest) return null;

  const { id, title, description, riskLevel = 'DANGEROUS', target, choices } = confirmationRequest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className={`glass-panel w-full max-w-lg p-6 border-2 ${riskLevel === 'CHOICE' ? 'border-cyan-500/40 shadow-cyan-950/50' : 'border-rose-500/40 shadow-rose-950/50'} shadow-2xl rounded-2xl relative overflow-hidden`}>
        {/* Top Glow Bar */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${riskLevel === 'CHOICE' ? 'from-cyan-500 via-purple-500 to-cyan-500' : 'from-rose-500 via-amber-500 to-rose-500'} animate-pulse`} />

        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-xl ${riskLevel === 'CHOICE' ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400' : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'}`}>
            <ShieldAlert className="w-8 h-8 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge ${riskLevel === 'CHOICE' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'badge-rose'} font-bold tracking-wider`}>
                {riskLevel === 'CHOICE' ? 'SELECT EDITOR' : `${riskLevel} ACTION`}
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {id || 'CONFIRM_01'}</span>
            </div>
            <h2 className="text-xl font-extrabold text-white">{title || 'Confirmation Required'}</h2>
          </div>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-xl border border-white/10 mb-6 font-mono text-sm text-slate-300 leading-relaxed">
          <p className="mb-2 text-slate-200">{description || 'MJ is asking for your selection.'}</p>
          {target && (
            <div className="mt-3 p-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg text-cyan-300 text-xs break-all">
              <span className="font-semibold text-slate-400">Target Path: </span>{target}
            </div>
          )}
        </div>

        {choices && choices.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-2">
            {choices.map((c, i) => (
              <button
                key={i}
                onClick={() => onChoice ? onChoice(c.value) : onConfirm(c.value)}
                className="px-4 py-3 bg-gradient-to-r from-cyan-600/30 to-purple-600/30 hover:from-cyan-500/50 hover:to-purple-500/50 border border-cyan-400/40 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-105"
              >
                {c.value === 'vscode' ? <FileCode className="w-5 h-5 text-cyan-300" /> : <FileText className="w-5 h-5 text-amber-300" />}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="btn-secondary px-5 py-2.5 flex items-center gap-2 hover:border-slate-500"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              onClick={onConfirm}
              className="btn-danger px-6 py-2.5 flex items-center gap-2 shadow-lg shadow-rose-500/30"
            >
              <Check className="w-4 h-4" />
              <span>Authorize Action</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
