'use client'

import { useMemo } from 'react'
import { ChatMessage } from '../types'

export interface UserAnalytics {
  username: string
  messages: ChatMessage[]
  totalMessages: number
  chartsShared: number
  totalLikes: number
  avgMessageLength: number
  messageFrequency: number
  lastSeen: string
  badges: Array<{ name: string; verbose_name: string }>
  isPremium: boolean
  isModerator: boolean
  avatar: string
}

export function useUserAnalytics(messages: ChatMessage[]) {
  const userAnalytics = useMemo(() => {
    const userMap = new Map<string, ChatMessage[]>()
    
    // Group messages by user
    messages.forEach(message => {
      const existing = userMap.get(message.username) || []
      existing.push(message)
      userMap.set(message.username, existing)
    })

    // Calculate analytics for each user
    const analytics: UserAnalytics[] = Array.from(userMap.entries()).map(([username, userMessages]) => {
      const sortedMessages = userMessages.sort((a, b) => 
        new Date(a.time).getTime() - new Date(b.time).getTime()
      )
      
      const latestMessage = sortedMessages[sortedMessages.length - 1]
      const firstMessage = sortedMessages[0]
      
      // Calculate charts shared
      const chartsShared = userMessages.reduce((count, msg) => {
        return count + (msg.meta?.links?.charts?.data ? Object.keys(msg.meta.links.charts.data).length : 0)
      }, 0)

      // Calculate total likes
      const totalLikes = userMessages.reduce((count, msg) => {
        if (msg.meta?.temp?.chart_likes) {
          return count + Object.values(msg.meta.temp.chart_likes).reduce((sum, like) => sum + like.count, 0)
        }
        return count
      }, 0)

      // Calculate average message length
      const totalChars = userMessages.reduce((sum, msg) => sum + msg.text.length, 0)
      const avgMessageLength = Math.round(totalChars / userMessages.length)

      // Calculate message frequency (messages per hour)
      let messageFrequency = 0
      if (firstMessage && latestMessage) {
        const timeDiff = new Date(latestMessage.time).getTime() - new Date(firstMessage.time).getTime()
        const hoursDiff = Math.max(1, timeDiff / (1000 * 60 * 60))
        messageFrequency = Math.round((userMessages.length / hoursDiff) * 100) / 100
      }

      const badges = latestMessage?.badges || []
      const isPremium = badges.some(badge => badge.name.includes('premium'))
      const isModerator = latestMessage?.is_moderator || false

      return {
        username,
        messages: sortedMessages,
        totalMessages: userMessages.length,
        chartsShared,
        totalLikes,
        avgMessageLength,
        messageFrequency,
        lastSeen: latestMessage?.time || '',
        badges,
        isPremium,
        isModerator,
        avatar: latestMessage?.user_pic || latestMessage?.avatar || ''
      }
    })

    // Sort by total messages (most active first)
    return analytics.sort((a, b) => b.totalMessages - a.totalMessages)
  }, [messages])

  const getUserData = (username: string) => {
    return userAnalytics.find(user => user.username === username)
  }

  const getTopUsers = (limit: number = 10) => {
    return userAnalytics.slice(0, limit)
  }

  const getTopChartSharers = (limit: number = 5) => {
    return userAnalytics
      .filter(user => user.chartsShared > 0)
      .sort((a, b) => b.chartsShared - a.chartsShared)
      .slice(0, limit)
  }

  const getMostLikedUsers = (limit: number = 5) => {
    return userAnalytics
      .filter(user => user.totalLikes > 0)
      .sort((a, b) => b.totalLikes - a.totalLikes)
      .slice(0, limit)
  }

  return {
    userAnalytics,
    getUserData,
    getTopUsers,
    getTopChartSharers,
    getMostLikedUsers,
    totalUsers: userAnalytics.length
  }
}



