/** Pone en mayúscula solo la primera letra (el resto queda como se escribió: "y", siglas, etc.). */
export const capitalizeFirst = (value: string): string => {
    const index = value.search(/\S/);
    if (index === -1) return value;
    return value.slice(0, index) + value.charAt(index).toLocaleUpperCase('es-MX') + value.slice(index + 1);
};
