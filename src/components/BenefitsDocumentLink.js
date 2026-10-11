import React from 'react';
import { Link, Tooltip, Typography } from '@mui/material';
import { parseBenefitsDocumentUrl } from '../healthsherpa/submissionWebhook';

// Opens the HealthSherpa-hosted benefits PDF in a new tab. This is the fallback
// for when AgencyView has not stored its own copy yet (see
// BenefitsDocumentViewer). The URL is checked again at render, so a bad value
// already in storage is never shown as a link.
const BenefitsDocumentLink = ({ document }) => {
  const rawUrl = document && typeof document === 'object' ? document.url : document;
  const { url } = parseBenefitsDocumentUrl(rawUrl);

  if (!url) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not available
      </Typography>
    );
  }

  const label = (document && document.label) || 'Summary of Benefits';
  return (
    <Tooltip title="Hosted by HealthSherpa. The link may expire or require sign-in.">
      <Link href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </Link>
    </Tooltip>
  );
};

export default BenefitsDocumentLink;
