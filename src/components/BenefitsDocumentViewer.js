import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Typography,
} from '@mui/material';
import BenefitsDocumentLink from './BenefitsDocumentLink';

// Only same-origin paths ("/api/...") or https URLs may be embedded. AgencyView's
// API serves the stored copy at `viewUrl`, behind the user's normal session.
export function safeViewUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch (e) {
    return null;
  }
}

const FAILURE_TEXT = {
  unauthorized: 'HealthSherpa denied access',
  expired_or_missing: 'link expired or not found',
  not_pdf: 'HealthSherpa did not return a PDF',
  too_large: 'file too large',
  timeout: 'download timed out',
};

// Shows AgencyView's stored copy of the benefits PDF inline. Until a copy is
// stored, it falls back to the HealthSherpa-hosted link.
const BenefitsDocumentViewer = ({ document }) => {
  const [open, setOpen] = useState(false);
  const doc = document && typeof document === 'object' ? document : null;
  const viewUrl = doc && doc.status === 'stored' ? safeViewUrl(doc.viewUrl) : null;
  const label = (doc && doc.label) || 'Summary of Benefits';

  if (!viewUrl) {
    const failed = doc && doc.status === 'download_failed';
    return (
      <Box>
        <BenefitsDocumentLink document={document} />
        {failed && (
          <Typography variant="caption" color="text.secondary" display="block">
            Copy not saved: {FAILURE_TEXT[doc.failureReason] || 'download failed'}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent sx={{ height: '80vh', p: 0 }}>
          <object data={viewUrl} type="application/pdf" width="100%" height="100%" title={label}>
            <Box sx={{ p: 2 }}>
              <Typography variant="body2">
                This browser cannot show PDFs inline.{' '}
                <Link href={viewUrl} target="_blank" rel="noopener noreferrer">
                  Open the PDF
                </Link>
              </Typography>
            </Box>
          </object>
        </DialogContent>
        <DialogActions>
          <Link href={viewUrl} target="_blank" rel="noopener noreferrer" sx={{ mr: 'auto', ml: 2 }}>
            Open in new tab
          </Link>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BenefitsDocumentViewer;
