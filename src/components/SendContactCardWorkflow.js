import React from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';

const STEPS = [
  {
    label: 'Create your contact card',
    body: 'Use the free Contact Card (VCF) Generator to download a .vcf file with your name, agency, phone, email and website.',
    action: 'vcf-generator',
  },
  {
    label: 'Open the Click and Play library',
    body: 'In Agent CRM, go to Add-ons → Click and Play library.',
  },
  {
    label: 'Install "Send Contact Card"',
    body: 'Find the Send Contact Card workflow and install it into your account.',
  },
  {
    label: 'Attach your VCF',
    body: 'Upload your .vcf file to the media library, then open the installed workflow and attach the file to its text/email step.',
  },
  {
    label: 'Publish',
    body: 'Review the trigger and message, then publish the workflow. New contacts will automatically receive your card so they can save you to their phone.',
  },
];

const SendContactCardWorkflow = ({ onBack, onOpenTool }) => {
  return (
    <Box>
      <Button onClick={onBack} sx={{ mb: 2 }}>
        ← All tools
      </Button>
      <Typography variant="h4" component="h1" gutterBottom>
        Send Contact Card Workflow
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Make sure every new lead has your number saved. When a client recognizes your name on an
        incoming call or text, they're far more likely to answer.
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Stepper orientation="vertical" nonLinear activeStep={-1}>
          {STEPS.map((step) => (
            <Step key={step.label} expanded active>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                <Typography color="text.secondary">{step.body}</Typography>
                {step.action && (
                  <Button
                    variant="contained"
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => onOpenTool(step.action)}
                  >
                    Open VCF Generator
                  </Button>
                )}
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <Alert severity="info" sx={{ mt: 3 }}>
        The Send Contact Card workflow lives in the Click and Play library under Add-ons. Need help?
        Email support@agent-crm.com.
      </Alert>
    </Box>
  );
};

export default SendContactCardWorkflow;
