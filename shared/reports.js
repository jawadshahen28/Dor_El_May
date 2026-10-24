export const REPORT_TYPES = [
  { value: 'arrived', label: 'وصلت المياه لحارتي' },
  { value: 'not_arrived', label: 'لم تصل المياه لحارتي' },
  { value: 'water_problem', label: 'مشكلة في المياه' },
];
export const REPORT_STATUSES = { new: 'جديد', reviewing: 'قيد المراجعة', resolved: 'تمت المعالجة', closed: 'مغلق' };
export const REPORT_DESCRIPTION_MAX = 2000;
export const normalizeReportDescription = (value) => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';

export function validateCitizenReport(values = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { _form: 'تعذّرت قراءة تفاصيل البلاغ.' };
  const errors = {};
  if (Object.keys(values).some((key) => !['type', 'description', 'submissionId'].includes(key))) errors._form = 'يرجى إرسال تفاصيل البلاغ المطلوبة فقط.';
  if (!REPORT_TYPES.some((type) => type.value === values.type)) errors.type = 'يرجى اختيار نوع البلاغ';
  if (values.description !== undefined && typeof values.description !== 'string') errors.description = 'يرجى إدخال تفاصيل البلاغ كنص';
  else {
    const description = normalizeReportDescription(values.description);
    if (description.length > REPORT_DESCRIPTION_MAX) errors.description = `تفاصيل البلاغ يجب ألا تتجاوز ${REPORT_DESCRIPTION_MAX} حرف`;
    else if (values.type === 'water_problem' && !description) errors.description = 'يرجى وصف المشكلة في تفاصيل البلاغ';
  }
  if (typeof values.submissionId !== 'string' || !/^[a-f\d]{32}$/i.test(values.submissionId)) errors._form = 'تعذّر تجهيز البلاغ، أعد فتح النموذج.';
  return errors;
}
