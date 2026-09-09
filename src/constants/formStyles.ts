export const autofillStyles = `
input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #102a24 !important;
  caret-color: #102a24 !important;
}
input:autofill {
  background-color: #ffffff !important;
  color: #102a24 !important;
  box-shadow: 0 0 0 1000px #ffffff inset !important;
}
`;
