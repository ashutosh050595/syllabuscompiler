
import React, { useState } from 'react';
import { Submission, ClassLevel, Section } from '../types';
import { INITIAL_TEACHERS } from '../constants';
import { refineSyllabusContent } from '../services/geminiService';

interface Props {
  onSubmit: (sub: Submission) => void;
}

const SubmissionForm: React.FC<Props> = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    email: '',
    dateFrom: '',
    dateTo: '',
    classLevel: '' as ClassLevel | '',
    section: '' as Section | '',
    subject: '',
    teacherName: '',
    chapterName: '',
    topics: '',
    homework: '',
  });

  const [loading, setLoading] = useState(false);
  const [aiRefining, setAiRefining] = useState<{field: string} | null>(null);
  const [success, setSuccess] = useState(false);

  const classOptions: ClassLevel[] = ['V', 'VI', 'VII'];
  
  const filteredSections: Section[] = formData.classLevel 
    ? Array.from(new Set(INITIAL_TEACHERS.flatMap(t => 
        t.assignedClasses.filter(ac => ac.classLevel === formData.classLevel).map(ac => ac.section)
      ))) as Section[]
    : [];
  
  const filteredSubjects = formData.classLevel
    ? Array.from(new Set(INITIAL_TEACHERS.flatMap(t => 
        t.assignedClasses.filter(ac => ac.classLevel === formData.classLevel).map(ac => ac.subject)
      )))
    : [];

  const handleRefine = async (field: 'topics' | 'homework') => {
    if (!formData[field]) return;
    setAiRefining({ field });
    const refined = await refineSyllabusContent(formData[field], field);
    setFormData(prev => ({ ...prev, [field]: refined }));
    setAiRefining(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const submission: Submission = {
      ...formData,
      classLevel: formData.classLevel as ClassLevel,
      section: formData.section as Section,
    } as Submission;

    setTimeout(() => {
      onSubmit(submission);
      setLoading(false);
      setSuccess(true);
      setFormData({
        email: '',
        dateFrom: '',
        dateTo: '',
        classLevel: '',
        section: '',
        subject: '',
        teacherName: '',
        chapterName: '',
        topics: '',
        homework: '',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setSuccess(false), 5000);
    }, 1000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      <div className="bg-blue-600 px-8 py-6 text-white">
        <h2 className="text-2xl font-bold">Weekly Class Plan</h2>
        <p className="text-blue-100 mt-1 opacity-90 text-sm">Finalize your weekly syllabus details for compilation.</p>
      </div>

      {success && (
        <div className="m-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg flex items-center space-x-3">
          <i className="fas fa-check-circle text-xl"></i>
          <span>Plan submitted successfully! It will be compiled for the class teacher.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-full">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address *</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="teacher@sacredheartkoderma.org"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date (From - Monday) *</label>
            <input
              type="date"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.dateFrom}
              onChange={e => setFormData({...formData, dateFrom: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date (To - Saturday) *</label>
            <input
              type="date"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.dateTo}
              onChange={e => setFormData({...formData, dateTo: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Class *</label>
            <select
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              value={formData.classLevel}
              onChange={e => setFormData({...formData, classLevel: e.target.value as ClassLevel, section: '', subject: '', teacherName: ''})}
            >
              <option value="">Choose Class</option>
              {classOptions.map(c => <option key={c} value={c}>Class {c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Section *</label>
            <select
              required
              disabled={!formData.classLevel}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none appearance-none disabled:bg-gray-50"
              value={formData.section}
              onChange={e => setFormData({...formData, section: e.target.value as Section, teacherName: ''})}
            >
              <option value="">Choose Section</option>
              {filteredSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="col-span-full">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Name of the Chapter to be taught in current week *</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., Chapter 5: Photosynthesis"
              value={formData.chapterName}
              onChange={e => setFormData({...formData, chapterName: e.target.value})}
            />
          </div>

          <div className="col-span-full">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-700">Topics/Subtopics of the Chapter to be taught *</label>
              <button 
                type="button" 
                onClick={() => handleRefine('topics')}
                className="text-[10px] font-black text-blue-600 hover:text-blue-700 flex items-center bg-blue-50 px-3 py-1.5 rounded-full uppercase tracking-widest"
              >
                {aiRefining?.field === 'topics' ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-magic mr-1"></i>}
                AI Polished
              </button>
            </div>
            <textarea
              required
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none font-medium"
              placeholder="Enter specific topics..."
              value={formData.topics}
              onChange={e => setFormData({...formData, topics: e.target.value})}
            />
          </div>

          <div className="col-span-full">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-700">Proposed Home Work *</label>
              <button 
                type="button" 
                onClick={() => handleRefine('homework')}
                className="text-[10px] font-black text-blue-600 hover:text-blue-700 flex items-center bg-blue-50 px-3 py-1.5 rounded-full uppercase tracking-widest"
              >
                {aiRefining?.field === 'homework' ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-magic mr-1"></i>}
                AI Polished
              </button>
            </div>
            <textarea
              required
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none font-medium"
              placeholder="Assign tasks..."
              value={formData.homework}
              onChange={e => setFormData({...formData, homework: e.target.value})}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-3 disabled:opacity-50 text-lg"
        >
          {loading ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <>
              <i className="fas fa-paper-plane"></i>
              <span>Finalize Lesson Plan</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default SubmissionForm;
