import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  EMPTY_CARD,
  buildVCard,
  downloadVCard,
  fullName,
  validateCard,
} from '../tools/vcard';

const SECTIONS = [
  {
    title: 'Personal Information',
    fields: [
      { name: 'firstName', label: 'First Name', required: true },
      { name: 'middleName', label: 'Middle Name' },
      { name: 'lastName', label: 'Last Name', required: true },
      { name: 'suffix', label: 'Suffix' },
      { name: 'nickname', label: 'Nickname' },
    ],
  },
  {
    title: 'Work Information',
    fields: [
      { name: 'organization', label: 'Organization' },
      { name: 'jobTitle', label: 'Job Title' },
      { name: 'website', label: 'Work Website', type: 'url' },
    ],
  },
  {
    title: 'Contact Information',
    fields: [
      { name: 'email', label: 'Email Address (main)', type: 'email', required: true },
      { name: 'phone', label: 'Phone Number', type: 'tel', required: true },
      { name: 'email2', label: 'Email Address (secondary, optional)', type: 'email' },
      { name: 'phone2', label: 'Phone Number 2 (optional, saved as "Mobile")', type: 'tel' },
    ],
  },
  {
    title: 'Additional Information',
    fields: [
      { name: 'birthday', label: 'Birthday', type: 'date' },
      { name: 'anniversary', label: 'Anniversary', type: 'date' },
    ],
  },
];

const VcfGenerator = ({ onBack }) => {
  const [card, setCard] = useState(EMPTY_CARD);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  const preview = useMemo(() => buildVCard(card), [card]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setCard((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = validateCard(card);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage({ severity: 'error', text: 'Please fix the highlighted fields.' });
      return;
    }
    downloadVCard(card);
    setMessage({ severity: 'success', text: `Contact card for ${fullName(card)} downloaded.` });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setMessage({ severity: 'success', text: 'vCard text copied to clipboard.' });
    } catch (error) {
      setMessage({ severity: 'error', text: 'Could not copy — select the preview text instead.' });
    }
  };

  return (
    <Box>
      <Button onClick={onBack} sx={{ mb: 2 }}>
        ← All tools
      </Button>
      <Typography variant="h4" component="h1" gutterBottom>
        Contact Card (VCF) Generator
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Fill out the form and your VCF card downloads to your device immediately. Your card is
        built in your browser and is not sent anywhere.
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper component="form" noValidate onSubmit={handleSubmit} sx={{ p: 3 }}>
            {SECTIONS.map((section) => (
              <Box key={section.title} sx={{ mb: 3 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  {section.title}
                </Typography>
                <Grid container spacing={2}>
                  {section.fields.map((field) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={field.name}>
                      <TextField
                        fullWidth
                        id={field.name}
                        name={field.name}
                        label={field.label}
                        type={field.type || 'text'}
                        required={field.required}
                        value={card[field.name]}
                        onChange={handleChange}
                        error={Boolean(errors[field.name])}
                        helperText={errors[field.name]}
                        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
            {message && (
              <Alert severity={message.severity} sx={{ mb: 2 }}>
                {message.text}
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button type="submit" variant="contained" size="large">
                Generate Contact Card
              </Button>
              <Button variant="outlined" size="large" onClick={() => setCard(EMPTY_CARD)}>
                Clear
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, position: { md: 'sticky' }, top: { md: 16 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" component="h2">
                Live preview
              </Typography>
              <Button size="small" onClick={handleCopy}>
                Copy
              </Button>
            </Box>
            <Box
              component="pre"
              data-testid="vcard-preview"
              sx={{
                bgcolor: 'grey.100',
                p: 2,
                borderRadius: 1,
                fontSize: 12,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {preview}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Tip: upload the downloaded .vcf to your AgencyView media library and use the Send Contact
              Card workflow to share it with every new lead.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default VcfGenerator;
