import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, API_URL } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (data.success) {
        login(data.user, data.token);
        navigate('/admin');
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] p-8 rounded-lg shadow-2xl w-full max-w-md border border-gray-800">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">Complete Registration</h2>
        <p className="text-gray-400 text-center mb-6 text-sm">Enter the email you were invited with and create a password.</p>
        
        {error && <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-sm">{error}</div>}
        
        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label className="block text-gray-400 mb-2 text-sm">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white rounded p-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-400 mb-2 text-sm">Create Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white rounded p-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
              required
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            Register & Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
